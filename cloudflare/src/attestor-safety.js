const JSON_HEADERS={"content-type":"application/json; charset=utf-8"};
const MAX_SKEW=10*60*1000;

export async function handleAttestorSafety(request,env,url=new URL(request.url)){
  if(!url.pathname.startsWith("/api/v1/attestors/"))return null;

  if(request.method==="GET"&&url.pathname==="/api/v1/attestors/capabilities")return reply({
    service:"AccordTrace Attestor Safety",
    version:"0.1.0",
    features:["offline_recovery_key","suspend","compromise","revoke","key_rotation_link","relationship_attestations","shared_recovery_detection"],
    policy:"Compromised attestor keys are terminal for confidence purposes and must rotate to a replacement Passport."
  });

  if(request.method==="POST"&&url.pathname==="/api/v1/attestors/enroll"){
    const b=await bodyJson(request); const passport=await requirePassport(env,b.passport_id);
    required(b.recovery_public_key,"recovery_public_key"); required(b.signed_at,"signed_at"); required(b.signature,"signature"); assertFresh(b.signed_at);
    if(String(b.recovery_public_key).trim()===String(passport.public_key).trim())throw new SafetyError("recovery_key_must_be_distinct",400);
    const existing=await env.DB.prepare("SELECT passport_id FROM attestor_safety_profiles WHERE passport_id=?1").bind(passport.id).first();
    if(existing)return reply({error:"attestor_profile_already_exists"},409);
    const fingerprint=await sha256(normalizePem(b.recovery_public_key));
    const payload={domain:"accordtrace.attestor.enroll.v1",passport_id:passport.id,recovery_key_fingerprint:fingerprint,signed_at:b.signed_at};
    await verifyEd25519(passport.public_key,canonicalize(payload),b.signature);
    const now=new Date().toISOString();
    await env.DB.prepare(`INSERT INTO attestor_safety_profiles
      (passport_id,recovery_public_key,recovery_key_fingerprint,state,enrolled_at,updated_at)
      VALUES (?1,?2,?3,'active',?4,?4)`).bind(passport.id,String(b.recovery_public_key).trim(),fingerprint,now).run();
    return reply({attestor:{passport_id:passport.id,state:"active",recovery_key_fingerprint:fingerprint,enrolled_at:now}},201);
  }

  if(request.method==="POST"&&url.pathname==="/api/v1/attestors/state"){
    const b=await bodyJson(request); required(b.passport_id,"passport_id"); required(b.to_state,"to_state"); required(b.observed_at,"observed_at"); required(b.signature,"signature"); assertFresh(b.observed_at);
    const profile=await env.DB.prepare("SELECT * FROM attestor_safety_profiles WHERE passport_id=?1").bind(b.passport_id).first();
    if(!profile)return reply({error:"attestor_profile_not_found"},404);
    const to=String(b.to_state); if(!["active","suspended","compromised","revoked"].includes(to))throw new SafetyError("invalid_state",400);
    if(profile.state==="compromised"&&to!=="compromised"&&to!=="revoked")throw new SafetyError("compromised_key_cannot_reactivate",409);
    if(profile.state==="revoked"&&to!=="revoked")throw new SafetyError("revoked_key_cannot_reactivate",409);
    const reason=text(b.reason,200)||null;
    const signedBy=to==="compromised"||to==="revoked"||profile.state==="suspended"?"recovery":"passport";
    const key=signedBy==="recovery"?profile.recovery_public_key:(await requirePassport(env,b.passport_id)).public_key;
    const payload={domain:"accordtrace.attestor.state.v1",passport_id:profile.passport_id,from_state:profile.state,to_state:to,reason,observed_at:b.observed_at};
    await verifyEd25519(key,canonicalize(payload),b.signature);
    const id=`ase_${crypto.randomUUID()}`,now=new Date().toISOString();
    await env.DB.batch([
      env.DB.prepare("INSERT INTO attestor_state_events (id,passport_id,from_state,to_state,reason,signed_by,signature,observed_at,created_at) VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9)").bind(id,profile.passport_id,profile.state,to,reason,signedBy,text(b.signature,1000),b.observed_at,now),
      env.DB.prepare(`UPDATE attestor_safety_profiles SET state=?1,updated_at=?2,
        compromised_at=CASE WHEN ?1='compromised' THEN ?2 ELSE compromised_at END,
        revoked_at=CASE WHEN ?1='revoked' THEN ?2 ELSE revoked_at END WHERE passport_id=?3`).bind(to,now,profile.passport_id)
    ]);
    return reply({event:{id,passport_id:profile.passport_id,from_state:profile.state,to_state:to,signed_by:signedBy,observed_at:b.observed_at}});
  }

  if(request.method==="POST"&&url.pathname==="/api/v1/attestors/rotate"){
    const b=await bodyJson(request); required(b.old_passport_id,"old_passport_id"); required(b.new_passport_id,"new_passport_id"); required(b.rotated_at,"rotated_at"); required(b.signature,"signature"); assertFresh(b.rotated_at);
    const oldProfile=await env.DB.prepare("SELECT * FROM attestor_safety_profiles WHERE passport_id=?1").bind(b.old_passport_id).first();
    if(!oldProfile)return reply({error:"attestor_profile_not_found"},404);
    const replacement=await requirePassport(env,b.new_passport_id); if(replacement.id===oldProfile.passport_id)throw new SafetyError("replacement_must_be_different",400);
    const payload={domain:"accordtrace.attestor.rotate.v1",old_passport_id:oldProfile.passport_id,new_passport_id:replacement.id,reason:text(b.reason,200)||"key_rotation",rotated_at:b.rotated_at};
    await verifyEd25519(oldProfile.recovery_public_key,canonicalize(payload),b.signature);
    const now=new Date().toISOString();
    await env.DB.prepare("UPDATE attestor_safety_profiles SET replacement_passport_id=?1,state='revoked',revoked_at=?2,updated_at=?2 WHERE passport_id=?3").bind(replacement.id,now,oldProfile.passport_id).run();
    return reply({rotation:{old_passport_id:oldProfile.passport_id,new_passport_id:replacement.id,status:"linked_and_old_revoked"}});
  }

  if(request.method==="POST"&&url.pathname==="/api/v1/attestors/relationships"){
    const b=await bodyJson(request); const attestor=await requirePassport(env,b.attestor_passport_id); await requirePassport(env,b.subject_passport_id);
    if(attestor.id===b.subject_passport_id)throw new SafetyError("self_relationship_not_allowed",400);
    const relationship=String(b.relationship||""); if(!["independent","related","unknown"].includes(relationship))throw new SafetyError("invalid_relationship",400);
    required(b.attestation_id,"attestation_id"); required(b.issued_at,"issued_at"); required(b.expires_at,"expires_at"); required(b.signature,"signature"); assertFresh(b.issued_at); const expires=assertExpiry(b.issued_at,b.expires_at);
    const payload={domain:"accordtrace.attestor.relationship.v1",attestation_id:cleanId(b.attestation_id),attestor_passport_id:attestor.id,subject_passport_id:cleanId(b.subject_passport_id),relationship,scope:"operator_control",issued_at:b.issued_at,expires_at:expires};
    await verifyEd25519(attestor.public_key,canonicalize(payload),b.signature);
    const now=new Date().toISOString();
    await env.DB.prepare(`INSERT OR IGNORE INTO attestor_relationship_attestations
      (id,attestor_passport_id,subject_passport_id,relationship,scope,issued_at,expires_at,signature,status,created_at,updated_at)
      VALUES (?1,?2,?3,?4,'operator_control',?5,?6,?7,'active',?8,?8)`)
      .bind(payload.attestation_id,attestor.id,payload.subject_passport_id,relationship,b.issued_at,expires,text(b.signature,1000),now).run();
    return reply({relationship_attestation:{...payload,status:"active"}},201);
  }

  const m=url.pathname.match(/^\/api\/v1\/attestors\/([^/]+)\/status$/);
  if(request.method==="GET"&&m){
    const id=decodeURIComponent(m[1]); const p=await env.DB.prepare("SELECT passport_id,recovery_key_fingerprint,state,enrolled_at,updated_at,compromised_at,revoked_at,replacement_passport_id FROM attestor_safety_profiles WHERE passport_id=?1").bind(id).first();
    if(!p)return reply({error:"attestor_profile_not_found"},404);
    const shared=await env.DB.prepare("SELECT COUNT(*) AS count FROM attestor_safety_profiles WHERE recovery_key_fingerprint=?1").bind(p.recovery_key_fingerprint).first();
    return reply({attestor:{...p,shared_recovery_key_profiles:Number(shared?.count??0),qualified_for_confidence:p.state==="active"&&Number(shared?.count??0)===1}});
  }

  return reply({error:"not_found"},404);
}

async function requirePassport(env,id){required(id,"passport_id");const p=await env.DB.prepare("SELECT id,public_key,status FROM agent_passports WHERE id=?1").bind(id).first();if(!p)throw new SafetyError("passport_not_found",404);if(p.status!=="active")throw new SafetyError("passport_not_active",403);return p}
function assertExpiry(a,b){const s=Date.parse(a),e=Date.parse(b);if(!Number.isFinite(s)||!Number.isFinite(e)||e<=s||e-s>365*86400000)throw new SafetyError("invalid_expiry",400);return new Date(e).toISOString()}
function assertFresh(v){const t=Date.parse(v);if(!Number.isFinite(t)||Math.abs(Date.now()-t)>MAX_SKEW)throw new SafetyError("timestamp_out_of_range",400)}
function normalizePem(v){return String(v||"").trim().replace(/\r\n/g,"\n")}
async function sha256(v){const d=await crypto.subtle.digest("SHA-256",new TextEncoder().encode(v));return [...new Uint8Array(d)].map(x=>x.toString(16).padStart(2,"0")).join("")}
async function verifyEd25519(pem,msg,sig){let k;try{k=await crypto.subtle.importKey("spki",pemBytes(pem),{name:"Ed25519"},false,["verify"])}catch{throw new SafetyError("invalid_public_key",422)}let ok=false;try{ok=await crypto.subtle.verify({name:"Ed25519"},k,b64(sig),new TextEncoder().encode(msg))}catch{}if(!ok)throw new SafetyError("signature_verification_failed",401)}
function pemBytes(p){const b=String(p||"").replace(/-----BEGIN PUBLIC KEY-----|-----END PUBLIC KEY-----|\s/g,"");return Uint8Array.from(atob(b),c=>c.charCodeAt(0))}
function b64(v){const n=String(v||"").replace(/-/g,"+").replace(/_/g,"/");return Uint8Array.from(atob(n+"=".repeat((4-n.length%4)%4)),c=>c.charCodeAt(0))}
function canonicalize(v){if(v===null||typeof v==="boolean"||typeof v==="string"||typeof v==="number")return JSON.stringify(v);if(Array.isArray(v))return`[${v.map(canonicalize).join(",")}]`;if(typeof v==="object")return`{${Object.keys(v).sort().map(k=>`${JSON.stringify(k)}:${canonicalize(v[k])}`).join(",")}}`;throw new SafetyError("unsupported_value",400)}
function cleanId(v){const s=String(v||"").trim();if(!/^[A-Za-z0-9][A-Za-z0-9._:-]{0,199}$/.test(s))throw new SafetyError("invalid_id",400);return s}
function text(v,n){return String(v??"").trim().slice(0,n)}function required(v,n){if(!String(v??"").trim())throw new SafetyError(`${n} is required`,400)}async function bodyJson(r){try{return await r.json()}catch{throw new SafetyError("request body must be JSON",400)}}function reply(b,s=200){return new Response(JSON.stringify(b),{status:s,headers:JSON_HEADERS})}
export class SafetyError extends Error{constructor(message,status=400){super(message);this.status=status}}
