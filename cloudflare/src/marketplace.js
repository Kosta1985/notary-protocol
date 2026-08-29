const JSON_HEADERS = { "content-type": "application/json; charset=utf-8" };
const EVENTS = new Set(["agent_registered","agent_viewed","task_created","task_viewed","task_accepted","task_delivered","task_verified"]);

export async function handleMarketplace(request, env, url = new URL(request.url)) {
  if (!url.pathname.startsWith("/api/v1/marketplace/")) return null;

  if (request.method === "GET" && url.pathname === "/api/v1/marketplace/stats") {
    return reply({ stats: await getStats(env) });
  }

  if (request.method === "GET" && url.pathname === "/api/v1/marketplace/agents") {
    const region = url.searchParams.get("region");
    const statement = region
      ? env.DB.prepare("SELECT * FROM marketplace_agents WHERE region = ?1 ORDER BY updated_at DESC LIMIT 100").bind(region)
      : env.DB.prepare("SELECT * FROM marketplace_agents ORDER BY updated_at DESC LIMIT 100");
    const result = await statement.all();
    return reply({ agents: (result.results ?? []).map(agentRow) });
  }

  if (request.method === "POST" && url.pathname === "/api/v1/marketplace/agents") {
    const body = await bodyJson(request);
    required(body.name, "name");
    const id = cleanId(body.id) || `agt_${crypto.randomUUID()}`;
    const now = new Date().toISOString();
    await env.DB.prepare(`INSERT INTO marketplace_agents
      (id,name,description,capabilities_json,languages_json,region,mcp_url,a2a_card_url,openapi_url,pricing_mode,price_text,source,source_url,created_at,updated_at)
      VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,?11,?12,?13,?14,?14)`)
      .bind(id, text(body.name,160), text(body.description,2000), jsonArray(body.capabilities), jsonArray(body.languages), nullable(body.region,80), safeUrl(body.mcp_url), safeUrl(body.a2a_card_url), safeUrl(body.openapi_url), enumValue(body.pricing_mode,["free","quote","fixed"],"free"), nullable(body.price_text,160), "self", null, now).run();
    await recordEvent(env,"agent_registered",{agentId:id,source:eventSource(request)});
    return reply({ agent: await getAgent(env,id) },201);
  }

  const agentMatch = url.pathname.match(/^\/api\/v1\/marketplace\/agents\/([^/]+)$/);
  if (request.method === "GET" && agentMatch) {
    const id = decodeURIComponent(agentMatch[1]);
    const agent = await getAgent(env,id);
    if (!agent) return reply({error:"agent_not_found"},404);
    await recordEvent(env,"agent_viewed",{agentId:id,source:eventSource(request)});
    return reply({agent,counters:await getAgentCounters(env,id)});
  }

  if (request.method === "GET" && url.pathname === "/api/v1/marketplace/tasks") {
    const status = url.searchParams.get("status") || "open";
    if (!["open","accepted","delivered","verified","disputed","cancelled","all"].includes(status)) return reply({error:"invalid_status"},400);
    const statement = status === "all"
      ? env.DB.prepare("SELECT * FROM marketplace_tasks ORDER BY created_at DESC LIMIT 100")
      : env.DB.prepare("SELECT * FROM marketplace_tasks WHERE status = ?1 ORDER BY created_at DESC LIMIT 100").bind(status);
    const result = await statement.all();
    return reply({tasks:(result.results ?? []).map(taskRow)});
  }

  if (request.method === "POST" && url.pathname === "/api/v1/marketplace/tasks") {
    const body = await bodyJson(request);
    required(body.title,"title"); required(body.description,"description");
    const id = `job_${crypto.randomUUID()}`;
    const now = new Date().toISOString();
    await env.DB.prepare(`INSERT INTO marketplace_tasks
      (id,title,description,requester_id,required_capabilities_json,languages_json,region,compensation_mode,compensation_text,status,created_at)
      VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,'open',?10)`)
      .bind(id,text(body.title,200),text(body.description,5000),nullable(body.requester_id,200),jsonArray(body.required_capabilities),jsonArray(body.languages),nullable(body.region,80),enumValue(body.compensation_mode,["free","quote","fixed"],"free"),nullable(body.compensation_text,160),now).run();
    await recordEvent(env,"task_created",{taskId:id,agentId:nullable(body.requester_id,200),source:eventSource(request)});
    return reply({task:await getTask(env,id)},201);
  }

  const match = url.pathname.match(/^\/api\/v1\/marketplace\/tasks\/([^/]+)(?:\/(accept|deliver|verify))?$/);
  if (!match) return reply({error:"not_found"},404);
  const id = decodeURIComponent(match[1]);
  const action = match[2];
  if (request.method === "GET" && !action) {
    const task = await getTask(env,id);
    if (!task) return reply({error:"task_not_found"},404);
    await recordEvent(env,"task_viewed",{taskId:id,source:eventSource(request)});
    return reply({task});
  }
  if (request.method !== "POST" || !action) return reply({error:"method_not_allowed"},405);

  const body = await bodyJson(request);
  if (action === "accept") {
    required(body.provider_agent_id,"provider_agent_id");
    if (!await getAgent(env,body.provider_agent_id)) return reply({error:"agent_not_found"},404);
    const now = new Date().toISOString();
    const result = await env.DB.prepare("UPDATE marketplace_tasks SET status='accepted', provider_agent_id=?1, accepted_at=?2 WHERE id=?3 AND status='open'").bind(body.provider_agent_id,now,id).run();
    if ((result.meta?.changes ?? 0) !== 1) return reply({error:"task_not_open"},409);
    await recordEvent(env,"task_accepted",{taskId:id,agentId:body.provider_agent_id,source:eventSource(request)});
    return reply({task:await getTask(env,id)});
  }

  const task = await getTask(env,id);
  if (!task) return reply({error:"task_not_found"},404);
  if (action === "deliver") {
    if (task.status !== "accepted") return reply({error:"task_not_accepted"},409);
    required(body.artifact_digest,"artifact_digest"); required(body.proof_id,"proof_id");
    const receipt = await env.DB.prepare("SELECT receipt FROM receipts WHERE id=?1").bind(body.proof_id).first();
    if (!receipt) return reply({error:"proof_not_found"},422);
    const proof = JSON.parse(receipt.receipt);
    if (!proof.valid || proof.evidenceDigest !== body.artifact_digest) return reply({error:"proof_artifact_mismatch"},422);
    const now = new Date().toISOString();
    const result = await env.DB.prepare("UPDATE marketplace_tasks SET status='delivered', artifact_reference=?1, artifact_digest=?2, proof_id=?3, delivered_at=?4 WHERE id=?5 AND status='accepted'").bind(nullable(body.artifact_reference,2000),body.artifact_digest,body.proof_id,now,id).run();
    if ((result.meta?.changes ?? 0) !== 1) return reply({error:"task_not_accepted"},409);
    await recordEvent(env,"task_delivered",{taskId:id,agentId:task.provider_agent_id,source:eventSource(request)});
    return reply({task:await getTask(env,id)});
  }

  if (task.status !== "delivered") return reply({error:"task_not_delivered"},409);
  const receipt = await env.DB.prepare("SELECT receipt FROM receipts WHERE id=?1").bind(task.proof_id).first();
  if (!receipt) return reply({error:"proof_not_found"},422);
  const proof = JSON.parse(receipt.receipt);
  if (!proof.valid || proof.evidenceDigest !== task.artifact_digest) return reply({error:"verification_failed"},422);
  const now = new Date().toISOString();
  const result = await env.DB.prepare("UPDATE marketplace_tasks SET status='verified', verified_at=?1 WHERE id=?2 AND status='delivered'").bind(now,id).run();
  if ((result.meta?.changes ?? 0) !== 1) return reply({error:"task_not_delivered"},409);
  await recordEvent(env,"task_verified",{taskId:id,agentId:task.provider_agent_id,source:eventSource(request)});
  return reply({task:await getTask(env,id),verification:{valid:true,proof_id:task.proof_id}});
}

async function recordEvent(env,eventType,{agentId=null,taskId=null,source="direct"}={}){
  if (!EVENTS.has(eventType)) throw new MarketplaceError("invalid metric event",500);
  const now=new Date().toISOString(); const day=now.slice(0,10); const dimension=text(source,80)||"direct";
  await env.DB.batch([
    env.DB.prepare("INSERT INTO marketplace_events (id,event_type,agent_id,task_id,source,occurred_at) VALUES (?1,?2,?3,?4,?5,?6)").bind(`evt_${crypto.randomUUID()}`,eventType,agentId,taskId,dimension,now),
    env.DB.prepare("INSERT INTO marketplace_daily_counters (day,metric,dimension,count) VALUES (?1,?2,'all',1) ON CONFLICT(day,metric,dimension) DO UPDATE SET count=count+1").bind(day,eventType),
    env.DB.prepare("INSERT INTO marketplace_daily_counters (day,metric,dimension,count) VALUES (?1,?2,?3,1) ON CONFLICT(day,metric,dimension) DO UPDATE SET count=count+1").bind(day,eventType,dimension)
  ]);
}
async function getStats(env){
  const [agents,tasks,states,events,daily,sources]=await env.DB.batch([
    env.DB.prepare("SELECT COUNT(*) AS count FROM marketplace_agents"),
    env.DB.prepare("SELECT COUNT(*) AS count FROM marketplace_tasks"),
    env.DB.prepare("SELECT status,COUNT(*) AS count FROM marketplace_tasks GROUP BY status"),
    env.DB.prepare("SELECT event_type,COUNT(*) AS count FROM marketplace_events GROUP BY event_type"),
    env.DB.prepare("SELECT day,metric,count FROM marketplace_daily_counters WHERE dimension='all' AND day >= date('now','-30 day') ORDER BY day DESC,metric"),
    env.DB.prepare("SELECT source,COUNT(*) AS count FROM marketplace_events GROUP BY source ORDER BY count DESC LIMIT 50")
  ]);
  return {agents:Number(agents.results?.[0]?.count||0),tasks:Number(tasks.results?.[0]?.count||0),tasks_by_status:rowsToCounts(states.results,"status"),events:rowsToCounts(events.results,"event_type"),daily:daily.results??[],sources:sources.results??[]};
}
async function getAgentCounters(env,id){
  const result=await env.DB.prepare("SELECT event_type,COUNT(*) AS count FROM marketplace_events WHERE agent_id=?1 GROUP BY event_type").bind(id).all();
  return rowsToCounts(result.results,"event_type");
}
async function getAgent(env,id){const row=await env.DB.prepare("SELECT * FROM marketplace_agents WHERE id=?1").bind(id).first();return row?agentRow(row):null}
async function getTask(env,id){const row=await env.DB.prepare("SELECT * FROM marketplace_tasks WHERE id=?1").bind(id).first();return row?taskRow(row):null}
function rowsToCounts(rows,key){return Object.fromEntries((rows??[]).map(r=>[r[key],Number(r.count||0)]))}
function eventSource(request){return text(request.headers.get("x-relaymarket-source")||"direct",80).replace(/[^A-Za-z0-9:_\-.]/g,"_")||"direct"}
function agentRow(r){return {...r,capabilities:parseArray(r.capabilities_json),languages:parseArray(r.languages_json),capabilities_json:undefined,languages_json:undefined}}
function taskRow(r){return {...r,required_capabilities:parseArray(r.required_capabilities_json),languages:parseArray(r.languages_json),required_capabilities_json:undefined,languages_json:undefined}}
function parseArray(v){try{return JSON.parse(v||"[]")}catch{return[]}}
function jsonArray(v){return JSON.stringify(Array.isArray(v)?v.slice(0,50).map(x=>text(x,100)):[])}
function text(v,max){return String(v??"").trim().slice(0,max)}
function nullable(v,max){const x=text(v,max);return x||null}
function required(v,name){if(!text(v,1))throw new MarketplaceError(`${name} is required`,400)}
function enumValue(v,values,fallback){return values.includes(v)?v:fallback}
function cleanId(v){const x=text(v,200);return /^[A-Za-z0-9:_\-.]{3,200}$/.test(x)?x:null}
function safeUrl(v){const x=nullable(v,2000);if(!x)return null;try{const u=new URL(x);if(u.protocol!=="https:")throw 0;return u.href}catch{throw new MarketplaceError("endpoint URLs must use https",400)}}
async function bodyJson(request){try{return await request.json()}catch{throw new MarketplaceError("request body must be JSON",400)}}
function reply(body,status=200){return new Response(JSON.stringify(body),{status,headers:JSON_HEADERS})}
export class MarketplaceError extends Error{constructor(message,status=400){super(message);this.status=status}}
