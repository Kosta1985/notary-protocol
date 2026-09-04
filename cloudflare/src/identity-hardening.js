const JSON_HEADERS={"content-type":"application/json; charset=utf-8"};
const MAX_SKEW=10*60*1000;
const TYPES=["verified_domain","organization","software_publisher","security_evaluator","payment_rail_identity"];

export async function handleIdentityHardening(request,env,url=new URL(request.url)){
  if(!url.pathname.startsWith('/api/v1/identity/'))return null;

  if(request.method==='POST'&&url.pathname==='/api/v1/identity/attestations'){
    const b=await bodyJson(request);
    const attestor=await activePassport(env,b.attestor_passport_id);
    const subject=await activePassport(env,b.subject_passport_id);
    if(!attestor)return reply({error:'attestor_passport_not_found'},404);
    if(!subject)return reply({error:'subject_passport_not_found'},404);
    if(attestor.id===subject.id)throw new IdentityHardeningError('self_attestation_not_allowed',400);
    const type=String(b.type||''); if(!TYPES.includes(type))throw new IdentityHardeningError('unsupported_attestation_type',400);
    required(b.attestation_id,'attestation_id'); required(b.subject_ref,'subject_ref'); required(b.issued_at,'issued_at'); required(b.expires_at,'expires_at'); required(b.signature,'signature');
    assertFresh(b.issued_at); const expires=assertExpiry(b.issued_at,b.expires_at);
    const rawRef=text(b.subject_ref,500); const storedRef=type==='verified_domain'?normalizeDomain(rawRef):rawRef;
    const subjectRefDigest=await sha256Hex(`accordtrace.identity.subject_ref.v1:${type}:${storedRef}`);
    const payload={domain:'accordtrace.identity.attestation.v1',attestation_id:cleanId(b.attestation_id),attestor_passport_id:attestor.id,subject_passport_id:subject.id,type,subject_ref:storedRef,evidence_digest:nullable(b.evidence_digest,256),issued_at:new Date(b.issued_at).toISOString(),expires_at:expires};
    await verifyEd25519(attestor.public_key,canonicalize(payload),b.signature);
    const now=new Date().toISOString();
    const r=await env.DB.prepare(`INSERT OR IGNORE INTO identity_attestations (id,attestor_passport_id,subject_passport_id,type,subject_ref,evidence_digest,issued_at,expires_at,signature,status,created_at,updated_at) VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,'active',?10,?10)`).bind(payload.attestation_id,attestor.id,subject.id,type,storedRef,payload.evidence_digest,payload.issued_at,payload.expires_at,text(b.signature,1000),now).run();
    if(Number(r.meta?.changes??1)===0)return reply({error:'attestation_already_exists'},409);
    return reply({attestation:{...payload,subject_ref:type==='verified_domain'?storedRef:null,subject_ref_digest:subjectRefDigest,status:'active',signature_verified:true},privacy:type==='verified_domain'?'verified domains are public evidence':'non-domain subject references are digest-only in public responses'},201);
  }

  const m=url.pathname.match(/^\/api\/v1\/identity\/passports\/([^/]+)\/evidence$/);
  if(request.method==='GET'&&m){
    const id=decodeURIComponent(m[1]); const subject=await activePassport(env,id); if(!subject)return reply({error:'passport_not_found'},404);
    const rows=await env.DB.prepare(`SELECT i.id,i.attestor_passport_id,i.type,i.subject_ref,i.evidence_digest,i.issued_at,i.expires_at,i.status,i.revoked_at,s.state AS attestor_safety_state,s.recovery_key_fingerprint FROM identity_attestations i LEFT JOIN attestor_safety_profiles s ON s.passport_id=i.attestor_passport_id WHERE i.subject_passport_id=?1 ORDER BY i.created_at DESC`).bind(id).all();
    const fingerprints=(rows.results||[]).map(x=>x.recovery_key_fingerprint).filter(Boolean); const counts=new Map(); for(const f of fingerprints)counts.set(f,(counts.get(f)||0)+1);
    const list=[]; for(const x of rows.results||[]){const effective=x.status==='active'&&Date.parse(x.expires_at)<=Date.now()?'expired':x.status; const uniqueRecovery=Boolean(x.recovery_key_fingerprint)&&Number(counts.get(x.recovery_key_fingerprint)||0)===1; const qualified=effective==='active'&&x.attestor_safety_state==='active'&&uniqueRecovery; list.push({id:x.id,attestor_passport_id:x.attestor_passport_id,type:x.type,subject_ref:x.type==='verified_domain'?x.subject_ref:null,subject_ref_digest:await sha256Hex(`accordtrace.identity.subject_ref.v1:${x.type}:${x.subject_ref}`),evidence_digest:x.evidence_digest,issued_at:x.issued_at,expires_at:x.expires_at,effective_status:effective,attestor_safety_state:x.attestor_safety_state||'unenrolled',safety_qualified:qualified});}
    const active=list.filter(x=>x.effective_status==='active'); const qualified=active.filter(x=>x.safety_qualified);
    return reply({passport_id:id,dimensions:{identity:dimension(qualified,['verified_domain','organization','payment_rail_identity']),security_posture:dimension(qualified,['security_evaluator']),publisher:dimension(qualified,['software_publisher'])},attestations:list,qualified_attestations:qualified.length,unqualified_active_attestations:active.length-qualified.length,trust_score:null,privacy:'Non-domain subject references are digest-only. Recovery-key fingerprints are never exposed.',limitations:['Only active safety-qualified attestors with a unique recovery-key profile count toward confidence dimensions.','Safety enrollment does not prove legal identity, beneficial ownership, or organizational independence.','Unsafe evidence remains auditable but does not increase confidence.']});
  }
  return null;
}

function dimension(rows,types){const r=rows.filter(x=>types.includes(x.type));return{status:r.length?'attested':'unattested',qualified_attestations:r.length,distinct_qualified_attestors:new Set(r.map(x=>x.attestor_passport_id)).size};}
async function activePassport(env,id){const s=String(id||'').trim();if(!s)return null;return env.DB.prepare(`SELECT id,public_key,status FROM agent_passports WHERE id=?1 AND status='active'`).bind(s).first();}
function normalizeDomain(v){const s=String(v||'').toLowerCase().replace(/^https?:\/\//,'').split('/')[0].replace(/\.$/,'');if(!/^(?=.{1,253}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/.test(s))throw new IdentityHardeningError('invalid_domain',400);return s;}
function assertExpiry(a,b){const s=Date.parse(a),e=Date.parse(b);if(!Number.isFinite(s)||!Number.isFinite(e)||e<=s||e-s>365*86400000)throw new IdentityHardeningError('invalid_expiry',400);return new Date(e).toISOString();}
function assertFresh(v){const t=Date.parse(v);if(!Number.isFinite(t)||Math.abs(Date.now()-t)>MAX_SKEW)throw new IdentityHardeningError('timestamp_out_of_range',400);}
function cleanId(v){const s=String(v||'').trim();if(!/^[A-Za-z0-9][A-Za-z0-9._:-]{0,199}$/.test(s))throw new IdentityHardeningError('invalid_id',400);return s;}
function text(v,n){return String(v??'').trim().slice(0,n);} function nullable(v,n){const s=text(v,n);return s||null;} function required(v,n){if(!String(v??'').trim())throw new IdentityHardeningError(`${n} is required`,400);}
async function verifyEd25519(pem,msg,sig){let k;try{k=await crypto.subtle.importKey('spki',pemBytes(pem),{name:'Ed25519'},false,['verify']);}catch{throw new IdentityHardeningError('invalid_public_key',422);}let ok=false;try{ok=await crypto.subtle.verify({name:'Ed25519'},k,b64(sig),new TextEncoder().encode(msg));}catch{}if(!ok)throw new IdentityHardeningError('signature_verification_failed',401);}
function pemBytes(p){const b=String(p||'').replace(/-----BEGIN PUBLIC KEY-----|-----END PUBLIC KEY-----|\s/g,'');return Uint8Array.from(atob(b),c=>c.charCodeAt(0));} function b64(v){const n=String(v||'').replace(/-/g,'+').replace(/_/g,'/');return Uint8Array.from(atob(n+'='.repeat((4-n.length%4)%4)),c=>c.charCodeAt(0));}
function canonicalize(v){if(v===null||typeof v==='boolean'||typeof v==='string'||typeof v==='number')return JSON.stringify(v);if(Array.isArray(v))return`[${v.map(canonicalize).join(',')}]`;return`{${Object.keys(v).sort().map(k=>`${JSON.stringify(k)}:${canonicalize(v[k])}`).join(',')}}`;}
async function sha256Hex(v){const d=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(String(v)));return[...new Uint8Array(d)].map(x=>x.toString(16).padStart(2,'0')).join('');}
async function bodyJson(r){try{return await r.json();}catch{throw new IdentityHardeningError('request body must be JSON',400);}} function reply(b,s=200){return new Response(JSON.stringify(b),{status:s,headers:JSON_HEADERS});}
export class IdentityHardeningError extends Error{constructor(message,status=400){super(message);this.status=status;}}
