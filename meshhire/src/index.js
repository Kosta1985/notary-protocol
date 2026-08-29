const JSON_HEADERS = { "content-type": "application/json; charset=utf-8" };

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    try {
      if (request.method === "OPTIONS") return cors(new Response(null, { status: 204 }));
      if (url.pathname === "/health") return json({ status: "ok", service: "meshhire", version: "0.1.0" });
      if (request.method === "GET" && url.pathname === "/.well-known/agent-card.json") return json(agentCard(url.origin));
      if (request.method === "GET" && url.pathname === "/llms.txt") return new Response(llmsTxt(url.origin), { headers: { "content-type": "text/plain; charset=utf-8" } });
      if (request.method === "GET" && url.pathname === "/openapi.json") return json(openApi(url.origin));
      if (url.pathname.startsWith("/api/v1/agents")) return cors(await agentsRoute(request, env, url));
      if (url.pathname.startsWith("/api/v1/tasks")) return cors(await tasksRoute(request, env, url));
      if (request.method === "POST" && url.pathname === "/a2a") return cors(await a2aRoute(request, env, url));
      if (request.method === "GET") return env.ASSETS.fetch(request);
      return json({ error: "not_found" }, 404);
    } catch (error) {
      return cors(json({ error: error.code || "internal_error", message: error.message }, error.status || 500));
    }
  }
};

async function agentsRoute(request, env, url) {
  if (request.method === "GET" && url.pathname === "/api/v1/agents") {
    const region = url.searchParams.get("region");
    const stmt = region ? env.DB.prepare("SELECT * FROM agents WHERE status='active' AND region=?1 ORDER BY updated_at DESC LIMIT 100").bind(region) : env.DB.prepare("SELECT * FROM agents WHERE status='active' ORDER BY updated_at DESC LIMIT 100");
    const result = await stmt.all();
    return json({ agents: (result.results || []).map(agentRow) });
  }
  if (request.method === "POST" && url.pathname === "/api/v1/agents") {
    const body = await readJson(request); requireText(body.name, "name");
    const id = safeId(body.id) || `agt_${crypto.randomUUID()}`; const now = new Date().toISOString();
    await env.DB.prepare(`INSERT INTO agents (id,name,description,capabilities_json,languages_json,region,a2a_card_url,mcp_url,openapi_url,owner_ref,status,created_at,updated_at) VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,'active',?11,?11)`)
      .bind(id,clip(body.name,160),clip(body.description,2000),arr(body.capabilities),arr(body.languages),nullable(body.region,80),httpsUrl(body.a2a_card_url),httpsUrl(body.mcp_url),httpsUrl(body.openapi_url),nullable(body.owner_ref,200),now).run();
    return json({ agent: await getAgent(env,id) }, 201);
  }
  return json({ error: "not_found" }, 404);
}

async function tasksRoute(request, env, url) {
  if (request.method === "GET" && url.pathname === "/api/v1/tasks") {
    const status = url.searchParams.get("status") || "open"; const allowed = ["open","accepted","delivered","verified","disputed","cancelled","all"];
    if (!allowed.includes(status)) fail("invalid_status",400,"Unsupported task status");
    const stmt = status === "all" ? env.DB.prepare("SELECT * FROM tasks ORDER BY created_at DESC LIMIT 100") : env.DB.prepare("SELECT * FROM tasks WHERE status=?1 ORDER BY created_at DESC LIMIT 100").bind(status);
    const result = await stmt.all(); return json({ tasks: (result.results || []).map(taskRow) });
  }
  if (request.method === "POST" && url.pathname === "/api/v1/tasks") {
    const body = await readJson(request); requireText(body.title,"title"); requireText(body.description,"description");
    const id = `job_${crypto.randomUUID()}`; const now = new Date().toISOString();
    await env.DB.prepare(`INSERT INTO tasks (id,title,description,requester_ref,required_capabilities_json,languages_json,region,compensation_mode,compensation_text,status,created_at) VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,'open',?10)`)
      .bind(id,clip(body.title,200),clip(body.description,5000),nullable(body.requester_ref,200),arr(body.required_capabilities),arr(body.languages),nullable(body.region,80),enumVal(body.compensation_mode,["free","quote","fixed"],"free"),nullable(body.compensation_text,160),now).run();
    return json({ task: await getTask(env,id) }, 201);
  }
  const match = url.pathname.match(/^\/api\/v1\/tasks\/([^/]+)(?:\/(accept|deliver|verify))?$/); if (!match) return json({error:"not_found"},404);
  const id = decodeURIComponent(match[1]); const action = match[2];
  if (request.method === "GET" && !action) { const task=await getTask(env,id); return task?json({task}):json({error:"task_not_found"},404); }
  if (request.method !== "POST" || !action) return json({error:"method_not_allowed"},405);
  const body = await readJson(request); if(action==="accept") return acceptTask(env,id,body); if(action==="deliver") return deliverTask(env,id,body); return verifyTask(env,id);
}

async function acceptTask(env,id,body){requireText(body.provider_agent_id,"provider_agent_id");if(!await getAgent(env,body.provider_agent_id))return json({error:"agent_not_found"},404);const now=new Date().toISOString();const result=await env.DB.prepare("UPDATE tasks SET status='accepted',provider_agent_id=?1,accepted_at=?2 WHERE id=?3 AND status='open'").bind(body.provider_agent_id,now,id).run();if((result.meta?.changes||0)!==1)return json({error:"task_not_open"},409);return json({task:await getTask(env,id)});}
async function deliverTask(env,id,body){const task=await getTask(env,id);if(!task)return json({error:"task_not_found"},404);if(task.status!=="accepted")return json({error:"task_not_accepted"},409);requireText(body.artifact_digest,"artifact_digest");requireText(body.accordtrace_proof_id,"accordtrace_proof_id");const proof=await fetchAccordTraceProof(env,body.accordtrace_proof_id);if(!proof)return json({error:"proof_not_found"},422);if(!proofMatches(proof,body.artifact_digest))return json({error:"proof_artifact_mismatch"},422);const now=new Date().toISOString();await env.DB.prepare("UPDATE tasks SET status='delivered',artifact_reference=?1,artifact_digest=?2,accordtrace_proof_id=?3,delivered_at=?4 WHERE id=?5 AND status='accepted'").bind(nullable(body.artifact_reference,2000),body.artifact_digest,body.accordtrace_proof_id,now,id).run();return json({task:await getTask(env,id)});}
async function verifyTask(env,id){const task=await getTask(env,id);if(!task)return json({error:"task_not_found"},404);if(task.status!=="delivered")return json({error:"task_not_delivered"},409);const proof=await fetchAccordTraceProof(env,task.accordtrace_proof_id);if(!proof||!proofMatches(proof,task.artifact_digest))return json({error:"verification_failed"},422);const now=new Date().toISOString();await env.DB.prepare("UPDATE tasks SET status='verified',verified_at=?1 WHERE id=?2 AND status='delivered'").bind(now,id).run();return json({task:await getTask(env,id),verification:{valid:true,proof_id:task.accordtrace_proof_id}});}
async function fetchAccordTraceProof(env,proofId){const base=String(env.ACCORDTRACE_BASE_URL||"https://accordtrace.notary-labs.workers.dev").replace(/\/$/,"");for(const path of [`/api/v1/proofs/${encodeURIComponent(proofId)}`,`/v1/receipts/${encodeURIComponent(proofId)}`]){const r=await fetch(base+path,{headers:{"user-agent":"MeshHire/0.1 proof-verifier"}});if(r.ok)return r.json();if(r.status!==404)return null;}return null;}
function proofMatches(proof,digest){return Boolean((proof.valid??true)&&(proof.hash===digest||proof.evidenceDigest===digest||proof.digest===digest));}
async function a2aRoute(request,env,url){const body=await readJson(request);return json({jsonrpc:"2.0",id:body.id??null,result:{status:{state:"completed"},artifacts:[{name:"MeshHire discovery",parts:[{data:{agents:`${url.origin}/api/v1/agents`,tasks:`${url.origin}/api/v1/tasks`}}]}]}});}
function agentCard(origin){return{name:"MeshHire",description:"A2A marketplace for verifiable agent work.",url:`${origin}/a2a`,protocolVersion:"1.0",version:"0.1.0",capabilities:{streaming:false},defaultInputModes:["application/json"],defaultOutputModes:["application/json"],skills:[{id:"discover_agents",name:"Discover agents",description:"Find A2A/MCP-capable agents by capability and region."},{id:"discover_tasks",name:"Discover tasks",description:"Find open work for agents."},{id:"verify_delivery",name:"Verify delivery",description:"Verify task delivery through AccordTrace evidence receipts."}]};}
function llmsTxt(origin){return `# MeshHire\nA2A marketplace for verifiable agent work.\nAgents: ${origin}/api/v1/agents\nTasks: ${origin}/api/v1/tasks\nA2A: ${origin}/a2a\nOpenAPI: ${origin}/openapi.json\nVerified means evidence matches an AccordTrace receipt; it does not prove truth, identity, authorship, legality, payment, or quality.\n`;}
function openApi(origin){return{openapi:"3.1.0",info:{title:"MeshHire API",version:"0.1.0"},servers:[{url:origin}],paths:{"/api/v1/agents":{get:{summary:"List agents"},post:{summary:"Register agent"}},"/api/v1/tasks":{get:{summary:"List tasks"},post:{summary:"Create task"}},"/api/v1/tasks/{id}/accept":{post:{summary:"Accept task"}},"/api/v1/tasks/{id}/deliver":{post:{summary:"Deliver task with AccordTrace proof"}},"/api/v1/tasks/{id}/verify":{post:{summary:"Verify delivered task"}}}};}
async function getAgent(env,id){const r=await env.DB.prepare("SELECT * FROM agents WHERE id=?1").bind(id).first();return r?agentRow(r):null;}async function getTask(env,id){const r=await env.DB.prepare("SELECT * FROM tasks WHERE id=?1").bind(id).first();return r?taskRow(r):null;}
function agentRow(r){const o={...r,capabilities:parseArr(r.capabilities_json),languages:parseArr(r.languages_json)};delete o.capabilities_json;delete o.languages_json;return o;}function taskRow(r){const o={...r,required_capabilities:parseArr(r.required_capabilities_json),languages:parseArr(r.languages_json)};delete o.required_capabilities_json;delete o.languages_json;return o;}function parseArr(v){try{return JSON.parse(v||"[]");}catch{return[];}}function arr(v){return JSON.stringify(Array.isArray(v)?v.slice(0,50).map(x=>clip(x,100)):[]);}function clip(v,max){return String(v??"").trim().slice(0,max);}function nullable(v,max){const x=clip(v,max);return x||null;}function requireText(v,name){if(!clip(v,1))fail("invalid_request",400,`${name} is required`);}function safeId(v){const x=clip(v,200);return /^[A-Za-z0-9:_\-.]{3,200}$/.test(x)?x:null;}function enumVal(v,allowed,fallback){return allowed.includes(v)?v:fallback;}function httpsUrl(v){const x=nullable(v,2000);if(!x)return null;try{const u=new URL(x);if(u.protocol!=="https:")throw 0;return u.href;}catch{fail("invalid_url",400,"Agent endpoints must use https");}}async function readJson(request){try{return await request.json();}catch{fail("invalid_json",400,"Request body must be valid JSON");}}function fail(code,status,message){const e=new Error(message);e.code=code;e.status=status;throw e;}function json(body,status=200){return new Response(JSON.stringify(body),{status,headers:JSON_HEADERS});}function cors(response){const h=new Headers(response.headers);h.set("access-control-allow-origin","*");h.set("access-control-allow-methods","GET,POST,OPTIONS");h.set("access-control-allow-headers","content-type");h.set("cache-control","no-store");return new Response(response.body,{status:response.status,headers:h});}
