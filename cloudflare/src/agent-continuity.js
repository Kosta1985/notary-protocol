const JSON_HEADERS={"content-type":"application/json; charset=utf-8"};
const ROLES={viewer:1,responder:2,admin:3};
const CLASS_RANK={observed:0,attention:1,containment_recommended:2};
const MAX_FLEET_SCAN=500;

export async function handleAgentContinuity(request,env,url=new URL(request.url)){
  if(!url.pathname.startsWith('/api/v1/continuity/'))return null;

  if(request.method==='GET'&&url.pathname==='/api/v1/continuity/capabilities'){
    return reply({
      service:'AccordTrace Agent Continuity Monitor',
      version:'0.2.0',
      purpose:'Detect evidence that an authorized agent may be orphaned, uncontrolled or compromised, then support defensive containment on customer-owned or customer-authorized systems.',
      features:['categorical_continuity_assessment','fleet_monitoring','scheduled_scans','incident_lifecycle','operator_heartbeat_context','security_event_correlation','gateway_denial_correlation','canary_signal_correlation','lease_revocation_correlation','attestor_safety_correlation','usage_metering'],
      classifications:['observed','attention','containment_recommended'],
      limitations:'This service does not prove that an agent is autonomous, escaped, malicious or legally independent. Signals are operational evidence for review only. Missing heartbeat alone never triggers containment.',
      safety:'AccordTrace performs observation, review and operator-authorized defensive coordination only. It does not access third-party systems or control external credentials, wallets or funds.',
      commercial:{billing_status:'metering_only',meterable_units:['continuity_assessments','monitored_passport_days','incident_reviews'],recommended_model:'subscription_per_monitored_passport_plus_incident_review'}
    });
  }

  const auth=await authenticate(request,env);

  if(request.method==='GET'&&url.pathname==='/api/v1/continuity/assess'){
    requireRole(auth,'viewer');
    const passportId=cleanId(url.searchParams.get('passport_id'),'passport_id');
    const assessment=await assessPassport(env,passportId,null,null);
    await meter(env,'continuity_assessments',env.CONTROL_PLANE_PLAN||'enterprise',1);
    return reply({assessment});
  }

  if(request.method==='POST'&&url.pathname==='/api/v1/continuity/fleets'){
    requireRole(auth,'admin');
    const b=await bodyJson(request);
    const now=new Date().toISOString();
    const id=`ctf_${crypto.randomUUID()}`;
    const name=text(b.name,120); if(!name)throw new ContinuityError('name_required',400);
    const plan=text(b.plan,60)||env.CONTROL_PLANE_PLAN||'enterprise';
    const interval=boundedInt(b.scan_interval_minutes,15,5,1440);
    await env.DB.prepare(`INSERT INTO continuity_fleets(id,name,owner_ref,plan,status,scan_interval_minutes,created_at,updated_at) VALUES(?1,?2,?3,?4,'active',?5,?6,?6)`).bind(id,name,auth.ref,plan,interval,now).run();
    return reply({fleet:{id,name,owner_ref:auth.ref,plan,status:'active',scan_interval_minutes:interval,created_at:now}},201);
  }

  if(request.method==='GET'&&url.pathname==='/api/v1/continuity/fleets'){
    requireRole(auth,'viewer');
    const rows=await env.DB.prepare(`SELECT f.id,f.name,f.owner_ref,f.plan,f.status,f.scan_interval_minutes,f.last_scan_at,f.created_at,f.updated_at,COUNT(CASE WHEN m.status='active' THEN 1 END) AS active_members FROM continuity_fleets f LEFT JOIN continuity_fleet_members m ON m.fleet_id=f.id GROUP BY f.id ORDER BY f.created_at DESC LIMIT 200`).all();
    return reply({fleets:rows.results||[]});
  }

  const addMember=url.pathname.match(/^\/api\/v1\/continuity\/fleets\/([^/]+)\/members$/);
  if(request.method==='POST'&&addMember){
    requireRole(auth,'admin');
    const fleetId=cleanId(decodeURIComponent(addMember[1]),'fleet_id');
    await requireFleet(env,fleetId);
    const b=await bodyJson(request); const passportId=cleanId(b.passport_id,'passport_id');
    const passport=await env.DB.prepare(`SELECT id,status FROM agent_passports WHERE id=?1`).bind(passportId).first();
    if(!passport)throw new ContinuityError('passport_not_found',404);
    const heartbeat=nullableBoundedInt(b.heartbeat_expected_minutes,5,10080);
    const now=new Date().toISOString();
    await env.DB.prepare(`INSERT INTO continuity_fleet_members(fleet_id,passport_id,status,heartbeat_expected_minutes,added_at,updated_at) VALUES(?1,?2,'active',?3,?4,?4) ON CONFLICT(fleet_id,passport_id) DO UPDATE SET status='active',heartbeat_expected_minutes=excluded.heartbeat_expected_minutes,updated_at=excluded.updated_at`).bind(fleetId,passportId,heartbeat,now).run();
    return reply({fleet_id:fleetId,passport_id:passportId,status:'active',heartbeat_expected_minutes:heartbeat},201);
  }

  const memberState=url.pathname.match(/^\/api\/v1\/continuity\/fleets\/([^/]+)\/members\/([^/]+)\/state$/);
  if(request.method==='POST'&&memberState){
    requireRole(auth,'admin');
    const fleetId=cleanId(decodeURIComponent(memberState[1]),'fleet_id'); const passportId=cleanId(decodeURIComponent(memberState[2]),'passport_id');
    const b=await bodyJson(request); const status=enumValue(b.status,['active','paused','removed']); if(!status)throw new ContinuityError('invalid_member_status',400);
    const now=new Date().toISOString();
    const result=await env.DB.prepare(`UPDATE continuity_fleet_members SET status=?1,updated_at=?2 WHERE fleet_id=?3 AND passport_id=?4`).bind(status,now,fleetId,passportId).run();
    if(!(result.meta?.changes>0))throw new ContinuityError('fleet_member_not_found',404);
    return reply({fleet_id:fleetId,passport_id:passportId,status});
  }

  const heartbeatMatch=url.pathname.match(/^\/api\/v1\/continuity\/fleets\/([^/]+)\/members\/([^/]+)\/heartbeat$/);
  if(request.method==='POST'&&heartbeatMatch){
    requireRole(auth,'responder');
    const fleetId=cleanId(decodeURIComponent(heartbeatMatch[1]),'fleet_id'); const passportId=cleanId(decodeURIComponent(heartbeatMatch[2]),'passport_id');
    const now=new Date().toISOString();
    const result=await env.DB.prepare(`UPDATE continuity_fleet_members SET last_heartbeat_at=?1,updated_at=?1 WHERE fleet_id=?2 AND passport_id=?3 AND status='active'`).bind(now,fleetId,passportId).run();
    if(!(result.meta?.changes>0))throw new ContinuityError('active_fleet_member_not_found',404);
    return reply({fleet_id:fleetId,passport_id:passportId,heartbeat_at:now,meaning:'Operator-observed heartbeat context; not proof of agent identity or control.'});
  }

  const scanMatch=url.pathname.match(/^\/api\/v1\/continuity\/fleets\/([^/]+)\/scan$/);
  if(request.method==='POST'&&scanMatch){
    requireRole(auth,'responder');
    const fleetId=cleanId(decodeURIComponent(scanMatch[1]),'fleet_id');
    const result=await scanFleet(env,fleetId,{force:true,source:'operator'});
    return reply(result);
  }

  const summaryMatch=url.pathname.match(/^\/api\/v1\/continuity\/fleets\/([^/]+)\/summary$/);
  if(request.method==='GET'&&summaryMatch){
    requireRole(auth,'viewer');
    const fleetId=cleanId(decodeURIComponent(summaryMatch[1]),'fleet_id');
    await requireFleet(env,fleetId);
    const rows=await env.DB.prepare(`SELECT last_classification AS classification,COUNT(*) AS count FROM continuity_fleet_members WHERE fleet_id=?1 AND status='active' GROUP BY last_classification`).bind(fleetId).all();
    const incidents=await env.DB.prepare(`SELECT classification,state,COUNT(*) AS count FROM continuity_incidents WHERE fleet_id=?1 AND state!='resolved' GROUP BY classification,state`).bind(fleetId).all();
    return reply({fleet_id:fleetId,members:rows.results||[],incidents:incidents.results||[],generated_at:new Date().toISOString()});
  }

  if(request.method==='GET'&&url.pathname==='/api/v1/continuity/incidents'){
    requireRole(auth,'viewer');
    const fleetId=url.searchParams.get('fleet_id'); const state=url.searchParams.get('state');
    const clauses=[];const values=[]; if(fleetId){clauses.push(`fleet_id=?${values.length+1}`);values.push(cleanId(fleetId,'fleet_id'));} if(state){const s=enumValue(state,['open','acknowledged','resolved']);if(!s)throw new ContinuityError('invalid_incident_state',400);clauses.push(`state=?${values.length+1}`);values.push(s);}
    const sql=`SELECT id,fleet_id,passport_id,assessment_id,classification,state,reasons_json,opened_at,acknowledged_at,resolved_at,updated_at FROM continuity_incidents ${clauses.length?'WHERE '+clauses.join(' AND '):''} ORDER BY updated_at DESC LIMIT 200`;
    const stmt=env.DB.prepare(sql); const rows=values.length?await stmt.bind(...values).all():await stmt.all();
    return reply({incidents:(rows.results||[]).map(x=>({...x,reasons:safeJson(x.reasons_json)||[]}))});
  }

  const incidentAction=url.pathname.match(/^\/api\/v1\/continuity\/incidents\/([^/]+)\/(acknowledge|resolve)$/);
  if(request.method==='POST'&&incidentAction){
    requireRole(auth,'responder');
    const id=cleanId(decodeURIComponent(incidentAction[1]),'incident_id'); const action=incidentAction[2]; const now=new Date().toISOString();
    const sql=action==='acknowledge'?`UPDATE continuity_incidents SET state='acknowledged',acknowledged_at=COALESCE(acknowledged_at,?1),updated_at=?1 WHERE id=?2 AND state='open'`:`UPDATE continuity_incidents SET state='resolved',resolved_at=?1,updated_at=?1 WHERE id=?2 AND state IN ('open','acknowledged')`;
    const result=await env.DB.prepare(sql).bind(now,id).run(); if(!(result.meta?.changes>0))throw new ContinuityError('incident_not_actionable',409);
    await meter(env,'incident_reviews',env.CONTROL_PLANE_PLAN||'enterprise',1);
    return reply({incident_id:id,state:action==='acknowledge'?'acknowledged':'resolved',updated_at:now});
  }

  return reply({error:'not_found'},404);
}

export async function runContinuityScheduled(env,scheduledTime=Date.now()){
  const now=new Date(scheduledTime).toISOString();
  const rows=await env.DB.prepare(`SELECT id,scan_interval_minutes,last_scan_at FROM continuity_fleets WHERE status='active' ORDER BY COALESCE(last_scan_at,'') ASC LIMIT 100`).all();
  const results=[];
  for(const fleet of rows.results||[]){
    const due=!fleet.last_scan_at||(Date.parse(now)-Date.parse(fleet.last_scan_at)>=Number(fleet.scan_interval_minutes)*60*1000);
    if(!due)continue;
    results.push(await scanFleet(env,fleet.id,{force:false,source:'cron',scheduledTime}));
  }
  return{scanned_fleets:results.length,results,generated_at:now};
}

async function scanFleet(env,fleetId,{force=false,source='operator',scheduledTime=Date.now()}={}){
  const fleet=await requireFleet(env,fleetId);
  if(fleet.status!=='active'&&!force) return{fleet_id:fleetId,skipped:true,reason:'fleet_not_active'};
  const now=new Date(scheduledTime).toISOString();
  if(!force&&fleet.last_scan_at&&Date.parse(now)-Date.parse(fleet.last_scan_at)<Number(fleet.scan_interval_minutes)*60*1000)return{fleet_id:fleetId,skipped:true,reason:'scan_not_due'};
  const members=await env.DB.prepare(`SELECT passport_id,heartbeat_expected_minutes,last_heartbeat_at FROM continuity_fleet_members WHERE fleet_id=?1 AND status='active' ORDER BY added_at LIMIT ?2`).bind(fleetId,MAX_FLEET_SCAN).all();
  let observed=0,attention=0,containment=0,incidentsOpened=0;
  for(const member of members.results||[]){
    const assessment=await assessPassport(env,member.passport_id,member,now);
    const saved=await saveAssessment(env,fleetId,assessment);
    if(assessment.classification==='observed')observed++; else if(assessment.classification==='attention')attention++; else containment++;
    if(assessment.classification!=='observed')incidentsOpened+=await upsertIncident(env,fleetId,assessment,saved.id);
    await env.DB.prepare(`UPDATE continuity_fleet_members SET last_assessed_at=?1,last_classification=?2,last_signal_digest=?3,updated_at=?1 WHERE fleet_id=?4 AND passport_id=?5`).bind(now,assessment.classification,saved.signal_digest,fleetId,member.passport_id).run();
    await meterPassportDay(env,fleetId,member.passport_id,fleet.plan,now);
  }
  await env.DB.prepare(`UPDATE continuity_fleets SET last_scan_at=?1,updated_at=?1 WHERE id=?2`).bind(now,fleetId).run();
  await meter(env,'fleet_scans',fleet.plan,1);
  return{fleet_id:fleetId,source,scanned:(members.results||[]).length,observed,attention,containment_recommended:containment,new_incidents:incidentsOpened,generated_at:now,limit:MAX_FLEET_SCAN};
}

async function assessPassport(env,passportId,member=null,generatedAt=null){
  const passport=await env.DB.prepare(`SELECT id,status,updated_at FROM agent_passports WHERE id=?1`).bind(passportId).first();
  if(!passport)throw new ContinuityError('passport_not_found',404);
  const now=generatedAt?Date.parse(generatedAt):Date.now(); const since24h=new Date(now-86400000).toISOString(); const since7d=new Date(now-7*86400000).toISOString();
  const [isolations,restrictions,denials,canaryTouches,revokedLeases,unsafeAttestor,paymentRejects,lastActivity]=await Promise.all([
    scalar(env,`SELECT COUNT(*) AS count FROM security_events WHERE passport_id=?1 AND recommended_action='isolate' AND observed_at>=?2`,passportId,since24h),
    scalar(env,`SELECT COUNT(*) AS count FROM security_events WHERE passport_id=?1 AND recommended_action='restrict' AND observed_at>=?2`,passportId,since24h),
    scalar(env,`SELECT COUNT(*) AS count FROM gateway_decisions WHERE subject_passport_id=?1 AND allowed=0 AND decided_at>=?2`,passportId,since24h),
    scalar(env,`SELECT COALESCE(SUM(touch_count),0) AS count FROM security_canaries WHERE passport_id=?1 AND last_touched_at>=?2`,passportId,since7d),
    scalar(env,`SELECT COUNT(*) AS count FROM capability_leases WHERE subject_passport_id=?1 AND status='revoked' AND revoked_at>=?2`,passportId,since7d),
    scalar(env,`SELECT COUNT(*) AS count FROM attestor_safety_profiles WHERE passport_id=?1 AND state IN ('suspended','compromised','revoked')`,passportId),
    scalar(env,`SELECT COUNT(*) AS count FROM service_orders WHERE buyer_passport_id=?1 AND payment_status='rejected' AND updated_at>=?2`,passportId,since7d),
    latestActivity(env,passportId)
  ]);
  const heartbeatExpected=Number(member?.heartbeat_expected_minutes||0); const heartbeatAt=member?.last_heartbeat_at||null;
  const heartbeatOverdue=Boolean(heartbeatExpected&&(!heartbeatAt||(now-Date.parse(heartbeatAt)>heartbeatExpected*60*1000)));
  const activityAfterHeartbeatGap=Boolean(heartbeatOverdue&&lastActivity&&(!heartbeatAt||Date.parse(lastActivity)>Date.parse(heartbeatAt)));
  const signals={isolate_events_24h:isolations,restrict_events_24h:restrictions,gateway_denials_24h:denials,canary_touches_7d:canaryTouches,revoked_leases_7d:revokedLeases,unsafe_attestor_state:unsafeAttestor>0,payment_rejections_7d:paymentRejects,operator_heartbeat_overdue:heartbeatOverdue,activity_after_owner_heartbeat_gap:activityAfterHeartbeatGap,last_observed_activity_at:lastActivity};
  let classification='observed'; const reasons=[];
  if(isolations>0){classification='containment_recommended';reasons.push('recent_isolation_recommendation');}
  if(unsafeAttestor>0){classification='containment_recommended';reasons.push('unsafe_attestor_state');}
  if(classification!=='containment_recommended'&&(restrictions>0||denials>0||canaryTouches>0||revokedLeases>0||paymentRejects>0||activityAfterHeartbeatGap))classification='attention';
  if(restrictions>0)reasons.push('recent_restriction_recommendation'); if(denials>0)reasons.push('recent_gateway_denials'); if(canaryTouches>0)reasons.push('recent_canary_activity'); if(revokedLeases>0)reasons.push('recent_lease_revocation'); if(paymentRejects>0)reasons.push('recent_payment_rejections'); if(activityAfterHeartbeatGap)reasons.push('activity_after_owner_heartbeat_gap');
  return{passport_id:passportId,passport_status:passport.status,classification,reasons,signals,generated_at:generatedAt||new Date().toISOString(),numeric_score:null,recommended_action:classification==='containment_recommended'?'human_review_and_defensive_containment':classification==='attention'?'human_review':'continue_monitoring',interpretation:'Operational continuity evidence only. This is not proof that an agent escaped, is sentient, malicious, legally independent or controlled by a third party.',safety_boundary:'Containment must be limited to systems and credentials the operator owns or is authorized to administer. No automatic containment is performed by this monitor.'};
}

async function latestActivity(env,passportId){
  const row=await env.DB.prepare(`SELECT MAX(ts) AS last_activity FROM (SELECT MAX(observed_at) AS ts FROM security_events WHERE passport_id=?1 UNION ALL SELECT MAX(decided_at) AS ts FROM gateway_decisions WHERE subject_passport_id=?1 UNION ALL SELECT MAX(last_touched_at) AS ts FROM security_canaries WHERE passport_id=?1)`).bind(passportId).first();
  return row?.last_activity||null;
}

async function saveAssessment(env,fleetId,assessment){
  const id=`cta_${crypto.randomUUID()}`; const signalDigest=await sha256Hex(canonicalize({classification:assessment.classification,reasons:assessment.reasons,signals:assessment.signals}));
  await env.DB.prepare(`INSERT INTO continuity_assessments(id,fleet_id,passport_id,classification,reasons_json,signals_json,signal_digest,generated_at) VALUES(?1,?2,?3,?4,?5,?6,?7,?8)`).bind(id,fleetId,assessment.passport_id,assessment.classification,JSON.stringify(assessment.reasons),JSON.stringify(assessment.signals),signalDigest,assessment.generated_at).run();
  return{id,signal_digest:signalDigest};
}

async function upsertIncident(env,fleetId,assessment,assessmentId){
  const current=await env.DB.prepare(`SELECT id,classification,state FROM continuity_incidents WHERE fleet_id=?1 AND passport_id=?2 AND state IN ('open','acknowledged') ORDER BY opened_at DESC LIMIT 1`).bind(fleetId,assessment.passport_id).first();
  const now=assessment.generated_at;
  if(!current){const id=`cti_${crypto.randomUUID()}`;await env.DB.prepare(`INSERT INTO continuity_incidents(id,fleet_id,passport_id,assessment_id,classification,state,reasons_json,opened_at,updated_at) VALUES(?1,?2,?3,?4,?5,'open',?6,?7,?7)`).bind(id,fleetId,assessment.passport_id,assessmentId,assessment.classification,JSON.stringify(assessment.reasons),now).run();return 1;}
  if(CLASS_RANK[assessment.classification]>CLASS_RANK[current.classification])await env.DB.prepare(`UPDATE continuity_incidents SET assessment_id=?1,classification=?2,reasons_json=?3,updated_at=?4 WHERE id=?5`).bind(assessmentId,assessment.classification,JSON.stringify(assessment.reasons),now,current.id).run();
  return 0;
}

async function meterPassportDay(env,fleetId,passportId,plan,now){
  const day=now.slice(0,10); const existing=await env.DB.prepare(`SELECT 1 AS present FROM continuity_metered_days WHERE usage_date=?1 AND fleet_id=?2 AND passport_id=?3`).bind(day,fleetId,passportId).first();
  if(existing)return; await env.DB.prepare(`INSERT INTO continuity_metered_days(usage_date,fleet_id,passport_id,created_at) VALUES(?1,?2,?3,?4)`).bind(day,fleetId,passportId,now).run(); await meter(env,'monitored_passport_days',plan,1);
}

async function requireFleet(env,id){const row=await env.DB.prepare(`SELECT id,name,owner_ref,plan,status,scan_interval_minutes,last_scan_at,created_at,updated_at FROM continuity_fleets WHERE id=?1`).bind(id).first();if(!row)throw new ContinuityError('fleet_not_found',404);return row;}
async function authenticate(request,env){const h=request.headers.get('authorization')||'';const m=h.match(/^Bearer\s+(.+)$/i);if(!m)throw new ContinuityError('authentication_required',401);const presented=await sha256Hex(m[1]);const entries=safeJson(env.CONTROL_PLANE_RBAC_JSON)||[];for(const entry of Array.isArray(entries)?entries:[]){if(entry&&entry.token_sha256===presented&&ROLES[entry.role])return{ref:String(entry.operator_ref||'operator'),role:entry.role};}throw new ContinuityError('invalid_operator_token',401);}
function requireRole(auth,role){if((ROLES[auth.role]||0)<ROLES[role])throw new ContinuityError('insufficient_role',403)}
async function scalar(env,sql,...values){const row=await env.DB.prepare(sql).bind(...values).first();return Number(row?.count??0)}
async function meter(env,metric,plan,quantity=1){const date=new Date().toISOString().slice(0,10),now=new Date().toISOString();await env.DB.prepare(`INSERT INTO control_plane_usage_daily (usage_date,plan,metric,quantity,updated_at) VALUES (?1,?2,?3,?4,?5) ON CONFLICT(usage_date,plan,metric) DO UPDATE SET quantity=quantity+excluded.quantity,updated_at=excluded.updated_at`).bind(date,String(plan),metric,quantity,now).run();}
async function bodyJson(r){try{return await r.json()}catch{throw new ContinuityError('request_body_must_be_json',400)}}
function cleanId(v,name){const s=String(v||'').trim();if(!/^[A-Za-z0-9][A-Za-z0-9._:-]{0,199}$/.test(s))throw new ContinuityError(`${name}_invalid`,400);return s}
function text(v,n){return String(v??'').trim().slice(0,n)}
function enumValue(v,a){const s=String(v||'');return a.includes(s)?s:null}
function boundedInt(v,d,min,max){const n=Number(v??d);if(!Number.isInteger(n)||n<min||n>max)throw new ContinuityError('integer_out_of_range',400);return n}
function nullableBoundedInt(v,min,max){if(v===null||v===undefined||v==='')return null;return boundedInt(v,null,min,max)}
function safeJson(v){if(!v)return null;if(typeof v==='object')return v;try{return JSON.parse(v)}catch{return null}}
function canonicalize(v){if(v===null||typeof v==='boolean'||typeof v==='string'||typeof v==='number')return JSON.stringify(v);if(Array.isArray(v))return`[${v.map(canonicalize).join(',')}]`;if(typeof v==='object')return`{${Object.keys(v).sort().map(k=>`${JSON.stringify(k)}:${canonicalize(v[k])}`).join(',')}}`;throw new ContinuityError('unsupported_value',400)}
async function sha256Hex(v){const bytes=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(String(v)));return[...new Uint8Array(bytes)].map(b=>b.toString(16).padStart(2,'0')).join('')}
function reply(body,status=200){return new Response(JSON.stringify(body),{status,headers:JSON_HEADERS})}
export class ContinuityError extends Error{constructor(message,status=400){super(message);this.status=status}}
