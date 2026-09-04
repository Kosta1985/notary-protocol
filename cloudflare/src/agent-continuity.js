const JSON_HEADERS={"content-type":"application/json; charset=utf-8"};
const ROLES={viewer:1,responder:2,admin:3};

export async function handleAgentContinuity(request,env,url=new URL(request.url)){
  if(!url.pathname.startsWith('/api/v1/continuity/'))return null;

  if(request.method==='GET'&&url.pathname==='/api/v1/continuity/capabilities'){
    return reply({
      service:'AccordTrace Agent Continuity Monitor',
      version:'0.1.0',
      purpose:'Detect evidence that an authorized agent may be orphaned, uncontrolled or compromised, then support defensive containment on customer-owned or customer-authorized systems.',
      features:['categorical_continuity_assessment','security_event_correlation','gateway_denial_correlation','canary_signal_correlation','lease_revocation_correlation','attestor_safety_correlation','usage_metering'],
      classifications:['observed','attention','containment_recommended'],
      limitations:'This service does not prove that an agent is autonomous, escaped, malicious or legally independent. Signals are operational evidence for review only.',
      safety:'AccordTrace does not capture agents, access third-party systems, obtain credentials, seize wallets or transfer funds.',
      commercial:{billing_status:'metering_only',meterable_units:['continuity_assessments','monitored_passports','incident_reviews'],recommended_model:'subscription_per_monitored_passport_plus_incident_review'}
    });
  }

  const auth=await authenticate(request,env);

  if(request.method==='GET'&&url.pathname==='/api/v1/continuity/assess'){
    requireRole(auth,'viewer');
    const passportId=cleanId(url.searchParams.get('passport_id'),'passport_id');
    const assessment=await assessPassport(env,passportId);
    await meter(env,'continuity_assessments',env.CONTROL_PLANE_PLAN||'enterprise');
    return reply({assessment});
  }

  return reply({error:'not_found'},404);
}

async function assessPassport(env,passportId){
  const passport=await env.DB.prepare(`SELECT id,status,updated_at FROM agent_passports WHERE id=?1`).bind(passportId).first();
  if(!passport)throw new ContinuityError('passport_not_found',404);

  const now=Date.now();
  const since24h=new Date(now-24*60*60*1000).toISOString();
  const since7d=new Date(now-7*24*60*60*1000).toISOString();

  const [isolations,restrictions,denials,canaryTouches,revokedLeases,unsafeAttestor,paymentRejects]=await Promise.all([
    count(env,`SELECT COUNT(*) AS count FROM security_events WHERE passport_id=?1 AND recommended_action='isolate' AND observed_at>=?2`,passportId,since24h),
    count(env,`SELECT COUNT(*) AS count FROM security_events WHERE passport_id=?1 AND recommended_action='restrict' AND observed_at>=?2`,passportId,since24h),
    count(env,`SELECT COUNT(*) AS count FROM gateway_decisions WHERE subject_passport_id=?1 AND allowed=0 AND decided_at>=?2`,passportId,since24h),
    count(env,`SELECT COALESCE(SUM(touch_count),0) AS count FROM security_canaries WHERE passport_id=?1 AND last_touched_at>=?2`,passportId,since7d),
    count(env,`SELECT COUNT(*) AS count FROM capability_leases WHERE subject_passport_id=?1 AND status='revoked' AND revoked_at>=?2`,passportId,since7d),
    count(env,`SELECT COUNT(*) AS count FROM attestor_safety_profiles WHERE passport_id=?1 AND state IN ('suspended','compromised','revoked')`,passportId,null),
    count(env,`SELECT COUNT(*) AS count FROM service_orders WHERE buyer_passport_id=?1 AND payment_status='rejected' AND updated_at>=?2`,passportId,since7d)
  ]);

  const signals={
    isolate_events_24h:isolations,
    restrict_events_24h:restrictions,
    gateway_denials_24h:denials,
    canary_touches_7d:canaryTouches,
    revoked_leases_7d:revokedLeases,
    unsafe_attestor_state:unsafeAttestor>0,
    payment_rejections_7d:paymentRejects
  };

  let classification='observed';
  const reasons=[];
  if(isolations>0){classification='containment_recommended';reasons.push('recent_isolation_recommendation');}
  if(unsafeAttestor>0){classification='containment_recommended';reasons.push('unsafe_attestor_state');}
  if(classification!=='containment_recommended'&&(restrictions>0||denials>0||canaryTouches>0||revokedLeases>0||paymentRejects>0))classification='attention';
  if(restrictions>0)reasons.push('recent_restriction_recommendation');
  if(denials>0)reasons.push('recent_gateway_denials');
  if(canaryTouches>0)reasons.push('recent_canary_activity');
  if(revokedLeases>0)reasons.push('recent_lease_revocation');
  if(paymentRejects>0)reasons.push('recent_payment_rejections');

  return{
    passport_id:passportId,
    passport_status:passport.status,
    classification,
    reasons,
    signals,
    generated_at:new Date().toISOString(),
    numeric_score:null,
    recommended_action:classification==='containment_recommended'?'human_review_and_defensive_containment':classification==='attention'?'human_review':'continue_monitoring',
    interpretation:'Operational continuity evidence only. This is not proof that an agent escaped, is sentient, malicious, legally independent or controlled by a third party.',
    safety_boundary:'Containment must be limited to systems and credentials the operator owns or is authorized to administer.'
  };
}

async function authenticate(request,env){
  const h=request.headers.get('authorization')||'';
  const m=h.match(/^Bearer\s+(.+)$/i);
  if(!m)throw new ContinuityError('authentication_required',401);
  const presented=await sha256Hex(m[1]);
  const entries=safeJson(env.CONTROL_PLANE_RBAC_JSON)||[];
  for(const entry of Array.isArray(entries)?entries:[]){
    if(entry&&entry.token_sha256===presented&&ROLES[entry.role])return{ref:String(entry.operator_ref||'operator'),role:entry.role};
  }
  throw new ContinuityError('invalid_operator_token',401);
}

function requireRole(auth,role){if((ROLES[auth.role]||0)<ROLES[role])throw new ContinuityError('insufficient_role',403)}

async function count(env,sql,a,b){
  try{
    const stmt=env.DB.prepare(sql);
    const row=b===null?await stmt.bind(a).first():await stmt.bind(a,b).first();
    return Number(row?.count??0);
  }catch{return 0}
}

async function meter(env,metric,plan){
  try{
    const date=new Date().toISOString().slice(0,10),now=new Date().toISOString();
    await env.DB.prepare(`INSERT INTO control_plane_usage_daily (usage_date,plan,metric,quantity,updated_at) VALUES (?1,?2,?3,1,?4) ON CONFLICT(usage_date,plan,metric) DO UPDATE SET quantity=quantity+1,updated_at=excluded.updated_at`).bind(date,String(plan),metric,now).run();
  }catch{}
}

function cleanId(v,name){const s=String(v||'').trim();if(!/^[A-Za-z0-9][A-Za-z0-9._:-]{0,199}$/.test(s))throw new ContinuityError(`${name}_invalid`,400);return s}
function safeJson(v){if(!v)return null;if(typeof v==='object')return v;try{return JSON.parse(v)}catch{return null}}
async function sha256Hex(v){const bytes=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(String(v)));return[...new Uint8Array(bytes)].map(b=>b.toString(16).padStart(2,'0')).join('')}
function reply(body,status=200){return new Response(JSON.stringify(body),{status,headers:JSON_HEADERS})}
export class ContinuityError extends Error{constructor(message,status=400){super(message);this.status=status}}
