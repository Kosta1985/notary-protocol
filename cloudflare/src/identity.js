const JSON_HEADERS={"content-type":"application/json; charset=utf-8"};
const MAX_SKEW=10*60*1000;
let schemaReady=false;
const TYPES=["verified_domain","organization","software_publisher","security_evaluator","payment_rail_identity"];

export async function handleIdentity(request,env,url=new URL(request.url)){
  if(!url.pathname.startsWith("/api/v1/identity/"))return null;
  await ensureSchema(env);
  if(request.method==="GET"&&url.pathname==="/api/v1/identity/capabilities")return reply({service:"AccordTrace Independent Identity Evidence",version:"0.1.0",features:["third_party_attestations","expiry","revocation","reputation_dimensions"],trust_model:"Attestations prove that an independent Passport key signed a scoped claim. They do not by themselves prove legal identity, beneficial ownership, or independence of the attestor."});
  if(request.method==="POST"&&url.pathname==="/api/v1/identity/attestations"){
    const b=await bodyJson(request),attestor=await passport(env,b.attestor_passport_id),subject=await passport(env,b.subject_passport_id);
    if(attestor.id===subject.id)throw new IdentityError("self_attestation_not_allowed",400);
    const type=String(b.type||""); if(!TYPES.includes(type))throw new IdentityError("unsupported_attestation_type",400);
    required(b.attestation_id,"attestation_id"); required(b.subject_ref,"subject_ref"); required(b.issued_at,"issued_at"); required(b.expires_at,"expires_at"); required(b.signature,"signature");
    assertFresh(b.issued_at); const expires=assertExpiry(b.issued_at,b.expires_at);
    const payload={domain:"accordtrace.identity.attestation.v1",attestation_id:cleanId(b.attestation_id),attestor_passport_id:attestor.id,subject_passport_id:subject.id,type,subject_ref:text(b.subject_ref,500),evidence_digest:nullable(b.evidence_digest,256),issued_at:b.issued_at,expires_at:expires};
    await verifyEd25519(attestor.public_key,canonicalize(payload),b.signature);
    const now=new Date().toISOString();
    const r=await env.DB.prepare(`INSERT OR IGNORE INTO identity_attestations (id,attestor_passport_id,subject_passport_id,type,subject_ref,evidence_digest,issued_at,expires_at,signature,status,created_at,updated_at) VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,'active',?10,?10)`).bind(payload.attestation_id,attestor.id,subject.id,type,payload.subject_ref,payload.evidence_digest,payload.issued_at,payload.expires_at,text(b.signature,1000),now).run();
    if((r.meta?.changes??1)===0)return reply({error:"attestation_already_exists"},409);
    return reply({attestation:{...payload,status:"active",signature_verified:true}},201);
  }
  if(request.method==="POST"&&url.pathname==="/api/v1/identity/attestations/revoke"){
    const b=await bodyJson(request); required(b.attestation_id,"attestation_id"); required(b.attestor_passport_id,"attestor_passport_id"); required(b.revoked_at,"revoked_at"); required(b.signature,"signature"); assertFresh(b.revoked_at);
    const row=await env.DB.prepare("SELECT * FROM identity_attestations WHERE id=?1").bind(cleanId(b.attestation_id)).first(); if(!row)return reply({error:"attestation_not_found"},404);
    if(row.attestor_passport_id!==b.attestor_passport_id)return reply({error:"attestor_mismatch"},403);
    const attestor=await passport(env,b.attestor_passport_id),reason=nullable(b.reason,200)||"attestor_revoked";
    const payload={domain:"accordtrace.identity.attestation.revoke.v1",attestation_id:row.id,attestor_passport_id:attestor.id,reason,revoked_at:b.revoked_at}; await verifyEd25519(attestor.public_key,canonicalize(payload),b.signature);
    await env.DB.prepare("UPDATE identity_attestations SET status='revoked',revoked_at=?1,revoke_reason=?2,updated_at=?3 WHERE id=?4 AND status='active'").bind(b.revoked_at,reason,new Date().toISOString(),row.id).run();
    return reply({attestation_id:row.id,status:"revoked"});
  }
  const m=url.pathname.match(/^\/api\/v1\/identity\/passports\/([^/]+)\/evidence$/);
  if(request.method==="GET"&&m){const id=decodeURIComponent(m[1]); if(!await passport(env,id))return reply({error:"passport_not_found"},404); const rows=await env.DB.prepare("SELECT id,attestor_passport_id,type,subject_ref,evidence_digest,issued_at,expires_at,status,revoked_at FROM identity_attestations WHERE subject_passport_id=?1 ORDER BY created_at DESC").bind(id).all(); const list=(rows.results||[]).map(x=>({...x,effective_status:x.status==='active'&&Date.parse(x.expires_at)<=Date.now()?"expired":x.status})); const active=list.filter(x=>x.effective_status==='active'); return reply({passport_id:id,dimensions:{identity:dimension(active,["verified_domain","organization","payment_rail_identity"]),security_posture:dimension(active,["security_evaluator"]),publisher:dimension(active,["software_publisher"])},attestations:list,trust_score:null,limitations:["Attestor Passports may still be colluding or controlled by one operator.","No numeric score is published until anti-Sybil graph analysis is added."]});}
  return reply({error:"not_found"},404);
}
function dimension(rows,types){const relevant=rows.filter(r=>types.includes(r.type));return{status:relevant.length?"attested":"unattested",active_attestations:relevant.length,distinct_attestors:new Set(relevant.map(r=>r.attestor_passport_id)).size}}
async function passport(env,id){required(id,"passport_id");return env.DB.prepare("SELECT id,public_key,status FROM agent_passports WHERE id=?1 AND status='active'").bind(id).first()}
async function ensureSchema(env){if(schemaReady)return;for(const sql of [`CREATE TABLE IF NOT EXISTS identity_attestations (id TEXT PRIMARY KEY,attestor_passport_id TEXT NOT NULL,subject_passport_id TEXT NOT NULL,type TEXT NOT NULL,subject_ref TEXT NOT NULL,evidence_digest TEXT,issued_at TEXT NOT NULL,expires_at TEXT NOT NULL,signature TEXT NOT NULL,status TEXT NOT NULL DEFAULT 'active',revoked_at TEXT,revoke_reason TEXT,created_at TEXT NOT NULL,updated_at TEXT NOT NULL)`,`CREATE INDEX IF NOT EXISTS idx_identity_subject ON identity_attestations(subject_passport_id,status,expires_at)`,`CREATE INDEX IF NOT EXISTS idx_identity_attestor ON identity_attestations(attestor_passport_id,status,expires_at)`])await env.DB.prepare(sql).run();schemaReady=true}
function assertExpiry(a,b){const s=Date.parse(a),e=Date.parse(b);if(!Number.isFinite(s)||!Number.isFinite(e)||e<=s||e-s>365*24*60*60*1000)throw new IdentityError("invalid_expiry",400);return new Date(e).toISOString()}
function assertFresh(v){const t=Date.parse(v);if(!Number.isFinite(t)||Math.abs(Date.now()-t)>MAX_SKEW)throw new IdentityError("timestamp_out_of_range",400)}
function cleanId(v){const s=String(v||"").trim();if(!/^[A-Za-z0-9][A-Za-z0-9._:-]{0,199}$/.test(s))throw new IdentityError("invalid_id",400);return s}
function text(v,n){return String(v??"").trim().slice(0,n)} function nullable(v,n){const s=text(v,n);return s||null} function required(v,n){if(!String(v??"").trim())throw new IdentityError(`${n} is required`,400)}
async function verifyEd25519(pem,msg,sig){let k;try{k=await crypto.subtle.importKey("spki",pemBytes(pem),{name:"Ed25519"},false,["verify"])}catch{throw new IdentityError("invalid_public_key",422)}let ok=false;try{ok=await crypto.subtle.verify({name:"Ed25519"},k,b64(sig),new TextEncoder().encode(msg))}catch{}if(!ok)throw new IdentityError("signature_verification_failed",401)}
function pemBytes(p){const b=String(p||"").replace(/-----BEGIN PUBLIC KEY-----|-----END PUBLIC KEY-----|\s/g,"");return Uint8Array.from(atob(b),c=>c.charCodeAt(0))} function b64(v){const n=String(v||"").replace(/-/g,"+").replace(/_/g,"/");return Uint8Array.from(atob(n+"=".repeat((4-n.length%4)%4)),c=>c.charCodeAt(0))}
function canonicalize(v){if(v===null||typeof v==="boolean"||typeof v==="string")return JSON.stringify(v);if(typeof v==="number")return JSON.stringify(v);if(Array.isArray(v))return`[${v.map(canonicalize).join(",")}]`;if(typeof v==="object")return`{${Object.keys(v).sort().map(k=>`${JSON.stringify(k)}:${canonicalize(v[k])}`).join(",")}}`;throw new IdentityError("unsupported_value",400)}
async function bodyJson(r){try{return await r.json()}catch{throw new IdentityError("request body must be JSON",400)}} function reply(b,s=200){return new Response(JSON.stringify(b),{status:s,headers:JSON_HEADERS})}
export class IdentityError extends Error{constructor(message,status=400){super(message);this.status=status}}
