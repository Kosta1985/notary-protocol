import { handleReputation } from './reputation.js';

const JSON_HEADERS={"content-type":"application/json; charset=utf-8"};

export async function handleReputationHardening(request,env,url=new URL(request.url)){
  if(!url.pathname.startsWith('/api/v1/reputation/'))return null;
  if(request.method==='GET'&&url.pathname==='/api/v1/reputation/capabilities'){
    const base=await handleReputation(request,env,url); const body=await base.json();
    body.version='0.2.0'; body.features=[...(body.features||[]),'attestor_safety_qualification','shared_recovery_control_pattern'];
    body.release_rule='Only safety-qualified identity attestors contribute to identity/security confidence. Unsafe or shared-recovery evidence remains review-only and never triggers automatic punishment.';
    return reply(body,base.status);
  }
  const m=url.pathname.match(/^\/api\/v1\/reputation\/passports\/([^/]+)\/graph-signals$/);
  if(request.method!=='GET'||!m)return null;
  const base=await handleReputation(request,env,url); if(!base||!base.ok)return base;
  const body=await base.json(); const r=body.reputation_integrity; if(!r)return reply(body,base.status);
  const passportId=decodeURIComponent(m[1]); const now=new Date().toISOString();
  const rows=await env.DB.prepare(`SELECT i.attestor_passport_id,i.type,i.issued_at,s.state,s.recovery_key_fingerprint,(SELECT COUNT(*) FROM attestor_safety_profiles z WHERE z.recovery_key_fingerprint=s.recovery_key_fingerprint) AS recovery_key_users FROM identity_attestations i LEFT JOIN attestor_safety_profiles s ON s.passport_id=i.attestor_passport_id WHERE i.subject_passport_id=?1 AND i.status='active' AND i.expires_at>?2`).bind(passportId,now).all();
  const active=rows.results||[]; const qualified=active.filter(x=>x.state==='active'&&x.recovery_key_fingerprint&&Number(x.recovery_key_users)===1);
  const unsafe=active.length-qualified.length; const distinct=new Set(qualified.map(x=>x.attestor_passport_id)); const top=countTop(qualified.map(x=>x.attestor_passport_id));
  const identityFacts={active_attestations:qualified.length,distinct_attestors:distinct.size,evidence_age_days:ageDays(qualified.map(x=>x.issued_at)),concentration:{interactions:qualified.length,distinct_counterparties:distinct.size,top_counterparty_share:qualified.length?round3(top/qualified.length):null},qualification:'safety_qualified_only',excluded_unsafe_or_shared_recovery_attestations:unsafe};
  r.evidence_facts.identity=identityFacts;
  r.evidence_facts.security.independent_security_attestors=new Set(qualified.filter(x=>x.type==='security_evaluator').map(x=>x.attestor_passport_id)).size;
  const unsafeSignal={name:'unsafe_attestor_evidence',present:unsafe>0,evidence:{excluded_active_attestations:unsafe},interpretation:'review_only_not_proof'};
  const sharedSignal={name:'shared_recovery_control_pattern',present:active.some(x=>Number(x.recovery_key_users)>1),evidence:{present:active.some(x=>Number(x.recovery_key_users)>1)},interpretation:'review_only_not_proof'};
  const signals=(r.graph_signals?.signals||[]).filter(x=>!['unsafe_attestor_evidence','shared_recovery_control_pattern'].includes(x.name)); signals.push(unsafeSignal,sharedSignal);
  r.graph_signals={present_count:signals.filter(x=>x.present).length,signals};
  if(r.confidence_dimensions?.identity)r.confidence_dimensions.identity=qualified.length===0?'unattested':distinct.size>=2?'corroborated':'attested';
  if(r.confidence_dimensions?.security_posture&&r.evidence_facts.security.independent_security_attestors===0)r.confidence_dimensions.security_posture='unattested';
  r.limitations=[...(r.limitations||[]),'Identity and security confidence count only active attestors with an active safety profile and a recovery key not shared by another enrolled attestor.','Unsafe/shared-recovery signals are review evidence only; they do not prove collusion, common ownership, or malicious behavior.'];
  r.trust_score=null;
  return reply(body,base.status);
}

function countTop(values){const m=new Map();let top=0;for(const v of values){const n=(m.get(v)||0)+1;m.set(v,n);if(n>top)top=n;}return top;}
function ageDays(values){const t=values.map(Date.parse).filter(Number.isFinite);if(!t.length)return null;return Math.max(0,Math.floor((Date.now()-Math.min(...t))/86400000));}
function round3(v){return Math.round(v*1000)/1000;}
function reply(b,s=200){return new Response(JSON.stringify(b),{status:s,headers:JSON_HEADERS});}
export class ReputationHardeningError extends Error{constructor(message,status=400){super(message);this.status=status;}}
