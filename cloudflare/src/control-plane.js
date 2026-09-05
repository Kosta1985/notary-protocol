import {prepareAlertDelivery} from './alert-adapters.js';

const JSON_HEADERS={"content-type":"application/json; charset=utf-8"};
const ROLES={viewer:1,responder:2,admin:3};
const MAX_SKEW_MS=10*60*1000;

export async function handleControlPlane(request,env,url=new URL(request.url)){
  if(!url.pathname.startsWith('/api/v1/control-plane/'))return null;
  const auth=await authenticate(request,env);
  if(request.method==='GET'&&url.pathname==='/api/v1/control-plane/capabilities'){
    requireRole(auth,'viewer');
    return reply({service:'AccordTrace Incident Control Plane',version:'0.1.0',role:auth.role,features:['incident_summary','incident_timeline','rbac','append_only_audit','lease_revocation','customer_hook_dispatch','safe_alert_dispatch','usage_metering','customer_alert_adapters'],supported_alert_adapters:['webhook','slack_webhook','email_relay'],product_boundary:'Defensive coordination for customer-owned or customer-authorized infrastructure only.'});
  }
  if(request.method==='GET'&&url.pathname==='/api/v1/control-plane/summary'){
    requireRole(auth,'viewer');
    await meter(env,'console_reads',env.CONTROL_PLANE_PLAN||'enterprise');
    return reply({summary:await buildSummary(env)});
  }
  if(request.method==='GET'&&url.pathname==='/api/v1/control-plane/incidents'){
    requireRole(auth,'viewer');
    await meter(env,'console_reads',env.CONTROL_PLANE_PLAN||'enterprise');
    return reply(await buildIncidentTimeline(env,url));
  }
  if(request.method==='GET'&&url.pathname==='/api/v1/control-plane/audit'){
    requireRole(auth,'admin');
    const rows=await env.DB.prepare(`SELECT id,operator_ref,operator_role,action,target_type,target_ref,reason,event_digest,previous_chain_digest,chain_digest,result_json,created_at FROM control_plane_audit ORDER BY created_at DESC LIMIT 200`).all();
    return reply({audit:(rows.results||[]).map(r=>({...r,result:safeJson(r.result_json)}))});
  }
  if(request.method==='POST'&&url.pathname==='/api/v1/control-plane/actions/revoke-lease'){
    requireRole(auth,'responder');
    const b=await bodyJson(request); const leaseId=cleanId(b.lease_id,'lease_id'); const reason=text(b.reason,240)||'operator_containment';
    const lease=await env.DB.prepare(`SELECT id,status,issuer_passport_id,subject_passport_id FROM capability_leases WHERE id=?1`).bind(leaseId).first();
    if(!lease)return reply({error:'lease_not_found'},404);
    const now=new Date().toISOString();
    if(lease.status==='active')await env.DB.prepare(`UPDATE capability_leases SET status='revoked',revoked_at=?1,revoke_reason=?2,updated_at=?1 WHERE id=?3 AND status='active'`).bind(now,reason,leaseId).run();
    const audit=await appendAudit(env,auth,'revoke_lease','lease',leaseId,reason,{status:lease.status==='active'?'revoked':'already_revoked'});
    await meter(env,'containment_actions',env.CONTROL_PLANE_PLAN||'enterprise');
    await dispatchAlerts(env,{kind:'lease_revoked',severity:'high',target_type:'lease',target_ref:leaseId,event_digest:audit.event_digest,occurred_at:now});
    return reply({lease_id:leaseId,status:'revoked',audit_receipt:audit});
  }
  if(request.method==='POST'&&url.pathname==='/api/v1/control-plane/actions/dispatch-hook'){
    requireRole(auth,'responder');
    const b=await bodyJson(request); const hookType=enumValue(b.hook_type,['credential_revocation','sandbox_termination']); const targetRef=text(b.target_ref,240); const reason=text(b.reason,240)||'operator_containment';
    if(!hookType||!targetRef)throw new ControlPlaneError('invalid_hook_request',400);
    const audit=await appendAudit(env,auth,'dispatch_hook',hookType,targetRef,reason,{requested:true});
    const delivery=await dispatchConfiguredHook(env,hookType,targetRef,reason,audit.event_digest);
    await meter(env,'containment_hooks',env.CONTROL_PLANE_PLAN||'enterprise');
    return reply({hook_type:hookType,target_ref:targetRef,delivery,audit_receipt:audit});
  }
  if(request.method==='POST'&&url.pathname==='/api/v1/control-plane/actions/test-alert'){
    requireRole(auth,'admin');
    const b=await bodyJson(request); const message=text(b.message,300)||'AccordTrace alert test'; const now=new Date().toISOString(); const eventDigest=await sha256Hex(canonicalize({kind:'test_alert',message,at:now,operator:auth.ref}));
    const deliveries=await dispatchAlerts(env,{kind:'test_alert',severity:'info',message,event_digest:eventDigest,occurred_at:now});
    await appendAudit(env,auth,'test_alert','integration','configured',message,{deliveries:deliveries.map(x=>({integration_id:x.integration_id,status:x.status}))});
    return reply({deliveries});
  }
  return reply({error:'not_found'},404);
}

async function authenticate(request,env){
  const h=request.headers.get('authorization')||''; const m=h.match(/^Bearer\s+(.+)$/i); if(!m)throw new ControlPlaneError('authentication_required',401);
  const presented=await sha256Hex(m[1]);
  const entries=safeJson(env.CONTROL_PLANE_RBAC_JSON)||[];
  for(const entry of Array.isArray(entries)?entries:[]){if(entry&&entry.token_sha256===presented&&ROLES[entry.role])return{ref:String(entry.operator_ref||'operator'),role:entry.role};}
  throw new ControlPlaneError('invalid_operator_token',401);
}
function requireRole(auth,role){if((ROLES[auth.role]||0)<ROLES[role])throw new ControlPlaneError('insufficient_role',403)}

async function buildSummary(env){
  const [security,canaries,revokedLeases,unsafeAttestors,denials,paymentAnomalies]=await Promise.all([
    first(env,`SELECT COUNT(*) AS count FROM security_events WHERE recommended_action IN ('restrict','isolate')`),
    first(env,`SELECT COALESCE(SUM(touch_count),0) AS count FROM security_canaries WHERE touch_count>0`),
    first(env,`SELECT COUNT(*) AS count FROM capability_leases WHERE status='revoked'`),
    first(env,`SELECT COUNT(*) AS count FROM attestor_safety_profiles WHERE state IN ('suspended','compromised','revoked')`),
    first(env,`SELECT COUNT(*) AS count FROM gateway_decisions WHERE allowed=0`),
    first(env,`SELECT COUNT(*) AS count FROM service_orders WHERE payment_status='rejected'`)
  ]);
  return{material_security_events:num(security),canary_touches:num(canaries),revoked_leases:num(revokedLeases),unsafe_attestors:num(unsafeAttestors),gateway_denials:num(denials),payment_rejections:num(paymentAnomalies),generated_at:new Date().toISOString()};
}

async function buildIncidentTimeline(env,url){
  const type=url.searchParams.get('type'); const passport=url.searchParams.get('passport_id'); const limit=Math.min(200,Math.max(1,Number(url.searchParams.get('limit')||100)));
  const events=[];
  const sec=await env.DB.prepare(`SELECT id,passport_id,event_type,severity,recommended_action,source,observed_at FROM security_events ORDER BY created_at DESC LIMIT ?1`).bind(limit).all();
  for(const r of sec.results||[])events.push({kind:r.source==='accordtrace-canary'?'canary_touch':'security_event',severity:r.severity>=70?'high':r.severity>=40?'medium':'low',passport_id:r.passport_id,ref:r.id,action:r.recommended_action,occurred_at:r.observed_at});
  const den=await env.DB.prepare(`SELECT id,lease_id,subject_passport_id,reason,decided_at FROM gateway_decisions WHERE allowed=0 ORDER BY created_at DESC LIMIT ?1`).bind(limit).all();
  for(const r of den.results||[])events.push({kind:'gateway_denial',severity:r.reason==='quota_exhausted'?'medium':'high',passport_id:r.subject_passport_id,lease_id:r.lease_id,ref:r.id,reason:r.reason,occurred_at:r.decided_at});
  const rev=await env.DB.prepare(`SELECT id,subject_passport_id,revoke_reason,revoked_at FROM capability_leases WHERE status='revoked' ORDER BY revoked_at DESC LIMIT ?1`).bind(limit).all();
  for(const r of rev.results||[])events.push({kind:'lease_revocation',severity:'high',passport_id:r.subject_passport_id,lease_id:r.id,reason:r.revoke_reason,occurred_at:r.revoked_at});
  const att=await env.DB.prepare(`SELECT passport_id,state,state_reason,compromised_at,updated_at FROM attestor_safety_profiles WHERE state IN ('suspended','compromised','revoked') ORDER BY updated_at DESC LIMIT ?1`).bind(limit).all();
  for(const r of att.results||[])events.push({kind:'attestor_state',severity:r.state==='suspended'?'medium':'high',passport_id:r.passport_id,state:r.state,reason:r.state_reason,occurred_at:r.compromised_at||r.updated_at});
  const pay=await env.DB.prepare(`SELECT id,buyer_passport_id,seller_passport_id,payment_status,updated_at FROM service_orders WHERE payment_status='rejected' ORDER BY updated_at DESC LIMIT ?1`).bind(limit).all();
  for(const r of pay.results||[])events.push({kind:'payment_anomaly',severity:'medium',passport_id:r.buyer_passport_id,counterparty_present:Boolean(r.seller_passport_id),ref:r.id,status:r.payment_status,occurred_at:r.updated_at});
  const filtered=events.filter(e=>(!type||e.kind===type)&&(!passport||e.passport_id===passport)).sort((a,b)=>Date.parse(b.occurred_at||0)-Date.parse(a.occurred_at||0)).slice(0,limit);
  return{incidents:filtered,count:filtered.length,filters:{type:type||null,passport_id:passport||null},privacy:'No raw credentials, payment payloads, webhook secrets, IP addresses or agent tool arguments are returned.'};
}

async function appendAudit(env,auth,action,targetType,targetRef,reason,result){
  const now=new Date().toISOString(); const last=await env.DB.prepare(`SELECT chain_digest FROM control_plane_audit ORDER BY created_at DESC,id DESC LIMIT 1`).first(); const prev=last?.chain_digest||null;
  const event={operator_ref:auth.ref,operator_role:auth.role,action,target_type:targetType,target_ref:targetRef,reason:reason||null,result,created_at:now};
  const eventDigest=await sha256Hex(canonicalize(event)); const chainDigest=await sha256Hex(`${prev||''}:${eventDigest}`); const id=`cpa_${crypto.randomUUID()}`;
  await env.DB.prepare(`INSERT INTO control_plane_audit (id,operator_ref,operator_role,action,target_type,target_ref,reason,event_digest,previous_chain_digest,chain_digest,result_json,created_at) VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,?11,?12)`).bind(id,auth.ref,auth.role,action,targetType,targetRef,reason||null,eventDigest,prev,chainDigest,JSON.stringify(result||{}),now).run();
  return{id,event_digest:eventDigest,chain_digest:chainDigest,created_at:now};
}

async function dispatchConfiguredHook(env,hookType,targetRef,reason,eventDigest){
  const cfg=safeJson(env.CONTROL_PLANE_HOOKS_JSON)||[]; const hook=(Array.isArray(cfg)?cfg:[]).find(x=>x&&x.type===hookType&&x.enabled!==false);
  if(!hook)return recordHook(env,'none',hookType,targetRef,eventDigest,'skipped','hook_not_configured');
  if(!/^https:\/\//i.test(String(hook.url||'')))return recordHook(env,String(hook.id||'invalid'),hookType,targetRef,eventDigest,'failed','hook_url_must_be_https');
  try{
    const headers={'content-type':'application/json'}; if(hook.bearer_token)headers.authorization=`Bearer ${hook.bearer_token}`;
    const res=await fetch(hook.url,{method:'POST',headers,body:JSON.stringify({type:hookType,target_ref:targetRef,reason,event_digest:eventDigest,source:'AccordTrace Control Plane'})});
    return recordHook(env,String(hook.id||'hook'),hookType,targetRef,eventDigest,res.ok?'sent':'failed',res.ok?null:`http_${res.status}`);
  }catch{return recordHook(env,String(hook.id||'hook'),hookType,targetRef,eventDigest,'failed','network_error')}
}
async function recordHook(env,id,type,target,eventDigest,status,errorCode){const deliveryId=`cph_${crypto.randomUUID()}`;const now=new Date().toISOString();await env.DB.prepare(`INSERT INTO control_plane_hook_deliveries (id,hook_id,hook_type,target_ref,event_digest,status,error_code,created_at) VALUES (?1,?2,?3,?4,?5,?6,?7,?8)`).bind(deliveryId,id,type,target,eventDigest,status,errorCode,now).run();return{id:deliveryId,hook_id:id,status,error_code:errorCode};}

async function dispatchAlerts(env,event){
  const cfg=safeJson(env.CONTROL_PLANE_ALERTS_JSON)||[]; const out=[];
  for(const item of Array.isArray(cfg)?cfg:[]){
    if(!item||item.enabled===false)continue;
    const id=String(item.id||'integration'); const type=String(item.type||'webhook'); let status='failed',errorCode=null;
    const delivery=prepareAlertDelivery(item,event);
    if(delivery.error){status=delivery.error==='unsupported_adapter'?'skipped':'failed';errorCode=delivery.error;}
    else{try{const r=await fetch(delivery.url,{method:'POST',headers:delivery.headers,body:delivery.body,redirect:'error'});status=r.ok?'sent':'failed';if(!r.ok)errorCode=`http_${r.status}`;}catch{status='failed';errorCode='network_error';}}
    const deliveryId=`cpa_${crypto.randomUUID()}`;await env.DB.prepare(`INSERT INTO control_plane_alert_deliveries (id,integration_id,integration_type,event_digest,status,error_code,created_at) VALUES (?1,?2,?3,?4,?5,?6,?7)`).bind(deliveryId,id,type,event.event_digest,status,errorCode,new Date().toISOString()).run();out.push({integration_id:id,type,status,error_code:errorCode});
  }
  return out;
}

async function meter(env,metric,plan){const date=new Date().toISOString().slice(0,10),now=new Date().toISOString();await env.DB.prepare(`INSERT INTO control_plane_usage_daily (usage_date,plan,metric,quantity,updated_at) VALUES (?1,?2,?3,1,?4) ON CONFLICT(usage_date,plan,metric) DO UPDATE SET quantity=quantity+1,updated_at=excluded.updated_at`).bind(date,String(plan),metric,now).run();}
async function first(env,sql){return env.DB.prepare(sql).first()} function num(r){return Number(r?.count??0)}
function cleanId(v,name){const s=String(v||'').trim();if(!/^[A-Za-z0-9][A-Za-z0-9._:-]{0,199}$/.test(s))throw new ControlPlaneError(`${name}_invalid`,400);return s}
function text(v,n){return String(v??'').trim().slice(0,n)} function enumValue(v,a){const s=String(v||'');return a.includes(s)?s:null}
async function bodyJson(r){try{return await r.json()}catch{throw new ControlPlaneError('request_body_must_be_json',400)}}
function safeJson(v){if(!v)return null;if(typeof v==='object')return v;try{return JSON.parse(v)}catch{return null}}
async function sha256Hex(v){const bytes=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(String(v)));return[...new Uint8Array(bytes)].map(b=>b.toString(16).padStart(2,'0')).join('')}
function canonicalize(v){if(v===null||typeof v==='boolean'||typeof v==='string'||typeof v==='number')return JSON.stringify(v);if(Array.isArray(v))return`[${v.map(canonicalize).join(',')}]`;if(typeof v==='object')return`{${Object.keys(v).sort().map(k=>`${JSON.stringify(k)}:${canonicalize(v[k])}`).join(',')}}`;throw new ControlPlaneError('unsupported_value',400)}
function reply(b,s=200){return new Response(JSON.stringify(b),{status:s,headers:JSON_HEADERS})}
export class ControlPlaneError extends Error{constructor(message,status=400){super(message);this.status=status}}
