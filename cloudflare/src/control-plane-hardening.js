const JSON_HEADERS={"content-type":"application/json; charset=utf-8"};
const ROLES={viewer:1,responder:2,admin:3};
const MAX_SESSION_HOURS=12;
const MAX_ATTEMPTS=5;
const RETRY_SECONDS=[60,300,1800,7200,21600];

export async function handleControlPlaneHardening(request,env,url=new URL(request.url)){
  if(!url.pathname.startsWith('/api/v1/control-plane/maintenance/')&&!url.pathname.startsWith('/api/v1/control-plane/sessions/'))return null;
  const auth=await authenticate(request,env);
  await rateLimit(env,auth,url.pathname);

  if(request.method==='GET'&&url.pathname==='/api/v1/control-plane/maintenance/capabilities'){
    requireRole(auth,'viewer');
    return reply({service:'AccordTrace Control Plane Hardening',version:'0.1.0',role:auth.role,features:['ephemeral_sessions','operator_rate_limits','signed_webhook_outbox','deduplicated_alerts','bounded_retries','dead_letter_state','retention_jobs','audit_chain_retention_exemption'],audit_policy:'control_plane_audit is never deleted by automated retention'});
  }

  if(request.method==='POST'&&url.pathname==='/api/v1/control-plane/sessions/create'){
    requireRole(auth,'viewer');
    if(auth.auth_type==='session')throw new HardeningError('session_chaining_not_allowed',403);
    const body=await bodyJson(request); const hours=clampInt(body.hours||4,1,MAX_SESSION_HOURS); const requestedRole=String(body.role||auth.role);
    if(!ROLES[requestedRole]||ROLES[requestedRole]>ROLES[auth.role])throw new HardeningError('invalid_session_role',403);
    const raw=randomToken(); const tokenHash=await sha256Hex(raw); const now=new Date(); const expires=new Date(now.getTime()+hours*3600000).toISOString(); const id=`cps_${crypto.randomUUID()}`;
    await env.DB.prepare(`INSERT INTO control_plane_sessions (id,token_sha256,operator_ref,operator_role,parent_auth_digest,created_at,expires_at) VALUES (?1,?2,?3,?4,?5,?6,?7)`).bind(id,tokenHash,auth.ref,requestedRole,auth.auth_digest,now.toISOString(),expires).run();
    return reply({session:{id,operator_ref:auth.ref,role:requestedRole,expires_at:expires},token:raw,warning:'This token is shown once. Keep it in memory only and revoke it when no longer needed.'},201);
  }

  if(request.method==='POST'&&url.pathname==='/api/v1/control-plane/sessions/revoke'){
    requireRole(auth,'viewer'); const body=await bodyJson(request); const id=cleanId(body.session_id,'session_id'); const row=await env.DB.prepare(`SELECT id,operator_ref FROM control_plane_sessions WHERE id=?1`).bind(id).first();
    if(!row)return reply({error:'session_not_found'},404); if(auth.role!=='admin'&&row.operator_ref!==auth.ref)throw new HardeningError('cannot_revoke_other_operator_session',403);
    await env.DB.prepare(`UPDATE control_plane_sessions SET revoked_at=?1 WHERE id=?2 AND revoked_at IS NULL`).bind(new Date().toISOString(),id).run();
    return reply({session_id:id,status:'revoked'});
  }

  if(request.method==='POST'&&url.pathname==='/api/v1/control-plane/maintenance/alerts/enqueue'){
    requireRole(auth,'responder'); const body=await bodyJson(request); const event=normalizeAlertEvent(body.event); const configs=alertConfigs(env); const requested=Array.isArray(body.integration_ids)?body.integration_ids.map(String):null;
    const selected=configs.filter(x=>x&&x.enabled!==false&&(!requested||requested.includes(String(x.id)))); const now=new Date().toISOString(); const inserted=[];
    for(const cfg of selected){const id=String(cfg.id||'');if(!id)continue;const outboxId=`cpo_${crypto.randomUUID()}`;const payload=JSON.stringify(event);const r=await env.DB.prepare(`INSERT OR IGNORE INTO control_plane_alert_outbox (id,integration_id,event_digest,payload_json,status,attempts,next_attempt_at,created_at,updated_at) VALUES (?1,?2,?3,?4,'pending',0,?5,?5,?5)`).bind(outboxId,id,event.event_digest,payload,now).run();if((r.meta?.changes??1)>0)inserted.push({integration_id:id,outbox_id:outboxId});}
    return reply({event_digest:event.event_digest,enqueued:inserted,deduplicated:selected.length-inserted.length});
  }

  if(request.method==='POST'&&url.pathname==='/api/v1/control-plane/maintenance/alerts/process'){
    requireRole(auth,'admin'); const body=await optionalBodyJson(request); const limit=clampInt(body?.limit||25,1,100); const rows=await env.DB.prepare(`SELECT id,integration_id,event_digest,payload_json,attempts FROM control_plane_alert_outbox WHERE status='pending' AND next_attempt_at<=?1 ORDER BY created_at ASC LIMIT ?2`).bind(new Date().toISOString(),limit).all(); const results=[];
    for(const row of rows.results||[])results.push(await deliverOutbox(env,row));
    return reply({processed:results.length,results});
  }

  if(request.method==='POST'&&url.pathname==='/api/v1/control-plane/maintenance/retention/run'){
    requireRole(auth,'admin'); const body=await optionalBodyJson(request); const deliveryDays=clampInt(body?.delivery_retention_days||Number(env.CONTROL_PLANE_DELIVERY_RETENTION_DAYS||90),7,3650); const usageDays=clampInt(body?.usage_retention_days||Number(env.CONTROL_PLANE_USAGE_RETENTION_DAYS||400),30,3650); const now=new Date();
    const deliveryCutoff=new Date(now.getTime()-deliveryDays*86400000).toISOString(); const usageCutoff=new Date(now.getTime()-usageDays*86400000).toISOString().slice(0,10);
    const a=await env.DB.prepare(`DELETE FROM control_plane_alert_deliveries WHERE created_at<?1`).bind(deliveryCutoff).run(); const h=await env.DB.prepare(`DELETE FROM control_plane_hook_deliveries WHERE created_at<?1`).bind(deliveryCutoff).run(); const u=await env.DB.prepare(`DELETE FROM control_plane_usage_daily WHERE usage_date<?1`).bind(usageCutoff).run();
    const id=`cpr_${crypto.randomUUID()}`; const counts={alert_deliveries:Number(a.meta?.changes||0),hook_deliveries:Number(h.meta?.changes||0),usage_rows:Number(u.meta?.changes||0),audit_rows:0};
    await env.DB.prepare(`INSERT INTO control_plane_retention_runs (id,operator_ref,delivery_retention_days,usage_retention_days,deleted_alert_deliveries,deleted_hook_deliveries,deleted_usage_rows,audit_rows_deleted,created_at) VALUES (?1,?2,?3,?4,?5,?6,?7,0,?8)`).bind(id,auth.ref,deliveryDays,usageDays,counts.alert_deliveries,counts.hook_deliveries,counts.usage_rows,now.toISOString()).run();
    return reply({retention_run:{id,delivery_retention_days:deliveryDays,usage_retention_days:usageDays,deleted:counts},audit_policy:'append-only audit receipts are exempt from automated retention'});
  }

  return reply({error:'not_found'},404);
}

async function deliverOutbox(env,row){
  const cfg=alertConfigs(env).find(x=>x&&String(x.id)===String(row.integration_id)&&x.enabled!==false); if(!cfg)return markOutbox(env,row,'dead_letter','integration_not_configured');
  if(String(cfg.type||'webhook')!=='webhook')return markOutbox(env,row,'dead_letter','unsupported_adapter');
  if(!isHttpsUrl(cfg.url))return markOutbox(env,row,'dead_letter','url_must_be_https');
  const payload=String(row.payload_json); const timestamp=Math.floor(Date.now()/1000).toString(); const headers={'content-type':'application/json','x-accordtrace-event-digest':row.event_digest,'x-accordtrace-timestamp':timestamp};
  if(cfg.signing_secret){headers['x-accordtrace-signature']=`v1=${await hmacSha256Hex(String(cfg.signing_secret),`${timestamp}.${payload}`)}`;}
  if(cfg.bearer_token)headers.authorization=`Bearer ${cfg.bearer_token}`;
  let status='failed',error='network_error'; try{const res=await fetch(cfg.url,{method:'POST',headers,body:payload,redirect:'error'});status=res.ok?'sent':'failed';error=res.ok?null:`http_${res.status}`;}catch{}
  const deliveryId=`cpd_${crypto.randomUUID()}`; await env.DB.prepare(`INSERT INTO control_plane_alert_deliveries (id,integration_id,integration_type,event_digest,status,error_code,created_at) VALUES (?1,?2,'webhook',?3,?4,?5,?6)`).bind(deliveryId,row.integration_id,row.event_digest,status,error,new Date().toISOString()).run();
  if(status==='sent')return markOutbox(env,row,'sent',null);
  const attempts=Number(row.attempts||0)+1; if(attempts>=MAX_ATTEMPTS)return markOutbox(env,{...row,attempts},'dead_letter',error);
  const next=new Date(Date.now()+RETRY_SECONDS[Math.min(attempts-1,RETRY_SECONDS.length-1)]*1000).toISOString(); await env.DB.prepare(`UPDATE control_plane_alert_outbox SET attempts=?1,next_attempt_at=?2,last_error_code=?3,updated_at=?4 WHERE id=?5`).bind(attempts,next,error,new Date().toISOString(),row.id).run();
  return{outbox_id:row.id,integration_id:row.integration_id,status:'pending',attempts,next_attempt_at:next,error_code:error};
}
async function markOutbox(env,row,status,error){const attempts=status==='sent'?Number(row.attempts||0):Math.max(Number(row.attempts||0),MAX_ATTEMPTS);await env.DB.prepare(`UPDATE control_plane_alert_outbox SET status=?1,attempts=?2,last_error_code=?3,updated_at=?4 WHERE id=?5`).bind(status,attempts,error,new Date().toISOString(),row.id).run();return{outbox_id:row.id,integration_id:row.integration_id,status,attempts,error_code:error};}

async function authenticate(request,env){
  const h=request.headers.get('authorization')||''; const m=h.match(/^Bearer\s+(.+)$/i); if(!m)throw new HardeningError('authentication_required',401); const token=m[1]; const digest=await sha256Hex(token); const now=new Date().toISOString();
  const session=await env.DB.prepare(`SELECT operator_ref,operator_role FROM control_plane_sessions WHERE token_sha256=?1 AND revoked_at IS NULL AND expires_at>?2`).bind(digest,now).first(); if(session)return{ref:session.operator_ref,role:session.operator_role,auth_type:'session',auth_digest:digest};
  const entries=safeJson(env.CONTROL_PLANE_RBAC_JSON)||[]; for(const e of Array.isArray(entries)?entries:[]){if(e&&e.token_sha256===digest&&ROLES[e.role])return{ref:String(e.operator_ref||'operator'),role:e.role,auth_type:'root',auth_digest:digest};}
  throw new HardeningError('invalid_operator_token',401);
}
async function rateLimit(env,auth,path){const limit=clampInt(env.CONTROL_PLANE_RATE_LIMIT_PER_MINUTE||60,10,600);const minute=new Date().toISOString().slice(0,16);const bucket=`${minute}:${path}`;const now=new Date().toISOString();await env.DB.prepare(`INSERT INTO control_plane_rate_limits (bucket,operator_ref,count,updated_at) VALUES (?1,?2,1,?3) ON CONFLICT(bucket,operator_ref) DO UPDATE SET count=count+1,updated_at=excluded.updated_at`).bind(bucket,auth.ref,now).run();const row=await env.DB.prepare(`SELECT count FROM control_plane_rate_limits WHERE bucket=?1 AND operator_ref=?2`).bind(bucket,auth.ref).first();if(Number(row?.count||0)>limit)throw new HardeningError('rate_limit_exceeded',429);}
function requireRole(auth,role){if((ROLES[auth.role]||0)<ROLES[role])throw new HardeningError('insufficient_role',403)}
function alertConfigs(env){const v=safeJson(env.CONTROL_PLANE_ALERTS_JSON)||[];return Array.isArray(v)?v:[];}
function normalizeAlertEvent(input){const e=input&&typeof input==='object'?input:{};const digest=String(e.event_digest||'').trim();if(!/^[a-f0-9]{64}$/i.test(digest))throw new HardeningError('event_digest_required',400);return{kind:text(e.kind,80)||'control_plane_event',severity:enumValue(e.severity,['info','low','medium','high','critical'])||'info',target_type:text(e.target_type,80)||null,target_ref:text(e.target_ref,200)||null,event_digest:digest,occurred_at:validIso(e.occurred_at)?new Date(e.occurred_at).toISOString():new Date().toISOString(),message:text(e.message,300)||null,source:'AccordTrace Control Plane',contains_secrets:false};}
function randomToken(){const b=crypto.getRandomValues(new Uint8Array(32));return[...b].map(x=>x.toString(16).padStart(2,'0')).join('');}
async function hmacSha256Hex(secret,message){const key=await crypto.subtle.importKey('raw',new TextEncoder().encode(secret),{name:'HMAC',hash:'SHA-256'},false,['sign']);const sig=await crypto.subtle.sign('HMAC',key,new TextEncoder().encode(message));return[...new Uint8Array(sig)].map(x=>x.toString(16).padStart(2,'0')).join('');}
async function sha256Hex(v){const bytes=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(String(v)));return[...new Uint8Array(bytes)].map(b=>b.toString(16).padStart(2,'0')).join('');}
function isHttpsUrl(v){try{const u=new URL(String(v||''));return u.protocol==='https:'&&!u.username&&!u.password;}catch{return false;}}
function cleanId(v,name){const s=String(v||'').trim();if(!/^[A-Za-z0-9][A-Za-z0-9._:-]{0,199}$/.test(s))throw new HardeningError(`${name}_invalid`,400);return s;}
function clampInt(v,min,max){const n=Math.floor(Number(v));return Number.isFinite(n)?Math.max(min,Math.min(max,n)):min;}
function enumValue(v,a){const s=String(v||'');return a.includes(s)?s:null;} function text(v,n){return String(v??'').trim().slice(0,n);} function validIso(v){return Number.isFinite(Date.parse(v));}
async function bodyJson(r){try{return await r.json();}catch{throw new HardeningError('request_body_must_be_json',400);}} async function optionalBodyJson(r){try{const t=await r.text();return t?JSON.parse(t):{};}catch{throw new HardeningError('request_body_must_be_json',400);}}
function safeJson(v){if(!v)return null;if(typeof v==='object')return v;try{return JSON.parse(v);}catch{return null;}}
function reply(body,status=200){return new Response(JSON.stringify(body),{status,headers:JSON_HEADERS});}
export class HardeningError extends Error{constructor(message,status=400){super(message);this.status=status;}}
