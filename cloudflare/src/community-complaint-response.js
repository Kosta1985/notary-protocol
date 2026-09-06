const JSON_HEADERS={"content-type":"application/json; charset=utf-8"};
const MAX_SKEW=10*60*1000;

export async function handleCommunityComplaintResponse(request,env,url=new URL(request.url)){
  const responseMatch=url.pathname.match(/^\/api\/v1\/community\/complaints\/([^/]+)\/response$/);
  if(request.method==='POST'&&responseMatch){
    const complaintId=cleanId(decodeURIComponent(responseMatch[1]),'complaint_id');
    const complaint=await env.DB.prepare(`SELECT id,target_passport_id,state FROM community_complaints WHERE id=?1`).bind(complaintId).first();
    if(!complaint)throw new CommunityComplaintResponseError('complaint_not_found',404);
    if(['closed'].includes(complaint.state))throw new CommunityComplaintResponseError('complaint_not_open_for_response',409);
    const passport=await activePassport(env,complaint.target_passport_id);
    const body=await bodyJson(request);
    if(cleanId(body.responder_passport_id,'responder_passport_id')!==passport.id)throw new CommunityComplaintResponseError('responder_not_target',403);
    const requestId=cleanId(body.request_id,'request_id');
    const submittedAt=freshIso(body.submitted_at);
    const evidenceDigest=hexDigest(body.evidence_digest);
    const payload={domain:'accordtrace.community.complaint.response.v1',request_id:requestId,complaint_id:complaint.id,responder_passport_id:passport.id,evidence_digest:evidenceDigest,submitted_at:submittedAt};
    await verifyEd25519(passport.public_key,canonicalize(payload),body.signature);
    try{await env.DB.prepare(`INSERT INTO community_complaint_responses(complaint_id,responder_passport_id,evidence_digest,request_id,submitted_at) VALUES(?1,?2,?3,?4,?5)`).bind(complaint.id,passport.id,evidenceDigest,requestId,submittedAt).run();}
    catch{throw new CommunityComplaintResponseError('complaint_response_conflict',409)}
    return reply({complaint_id:complaint.id,response:{responder_passport_id:passport.id,evidence_digest:evidenceDigest,submitted_at:submittedAt},presumption:'response_evidence_only',automatic_trust_effect:false,automatic_enforcement:false},201);
  }

  const evidenceMatch=url.pathname.match(/^\/api\/v1\/community\/complaints\/([^/]+)\/evidence$/);
  if(request.method==='GET'&&evidenceMatch){
    const complaintId=cleanId(decodeURIComponent(evidenceMatch[1]),'complaint_id');
    const complaint=await env.DB.prepare(`SELECT id,category,evidence_digest,state,submitted_at,reviewed_at,resolution_code FROM community_complaints WHERE id=?1`).bind(complaintId).first();
    if(!complaint)return reply({error:'complaint_not_found'},404);
    const response=await env.DB.prepare(`SELECT evidence_digest,submitted_at FROM community_complaint_responses WHERE complaint_id=?1`).bind(complaintId).first();
    return reply({complaint,response:response||null,presumption:'allegation_and_response_evidence_only',meaning:'Complaint and response digests record competing evidence references. Neither side is automatically treated as true.',automatic_trust_effect:false,automatic_enforcement:false});
  }

  return null;
}

async function activePassport(env,id){const row=await env.DB.prepare(`SELECT id,public_key,status FROM agent_passports WHERE id=?1`).bind(id).first();if(!row||row.status!=='active')throw new CommunityComplaintResponseError('passport_not_active',404);return row}
function freshIso(value){const t=Date.parse(value);if(!Number.isFinite(t)||Math.abs(Date.now()-t)>MAX_SKEW)throw new CommunityComplaintResponseError('timestamp_out_of_range',400);return new Date(t).toISOString()}
function cleanId(value,name){const s=String(value||'').trim();if(!/^[A-Za-z0-9][A-Za-z0-9._:-]{0,199}$/.test(s))throw new CommunityComplaintResponseError(`${name}_invalid`,400);return s}
function hexDigest(value){const s=String(value||'').toLowerCase();if(!/^[a-f0-9]{64}$/.test(s))throw new CommunityComplaintResponseError('evidence_digest_invalid',400);return s}
async function verifyEd25519(pem,message,signature){let key;try{key=await crypto.subtle.importKey('spki',pemBytes(pem),{name:'Ed25519'},false,['verify'])}catch{throw new CommunityComplaintResponseError('invalid_public_key',422)}let ok=false;try{ok=await crypto.subtle.verify({name:'Ed25519'},key,b64(signature),new TextEncoder().encode(message))}catch{}if(!ok)throw new CommunityComplaintResponseError('signature_verification_failed',401)}
function pemBytes(pem){const b=String(pem||'').replace(/-----BEGIN PUBLIC KEY-----|-----END PUBLIC KEY-----|\s/g,'');return Uint8Array.from(atob(b),c=>c.charCodeAt(0))}
function b64(value){const n=String(value||'').replace(/-/g,'+').replace(/_/g,'/');return Uint8Array.from(atob(n+'='.repeat((4-n.length%4)%4)),c=>c.charCodeAt(0))}
function canonicalize(value){if(value===null||typeof value==='boolean'||typeof value==='string'||typeof value==='number')return JSON.stringify(value);if(Array.isArray(value))return`[${value.map(canonicalize).join(',')}]`;if(typeof value==='object')return`{${Object.keys(value).sort().map(k=>`${JSON.stringify(k)}:${canonicalize(value[k])}`).join(',')}}`;throw new CommunityComplaintResponseError('unsupported_value',400)}
async function bodyJson(request){try{const value=await request.json();if(!value||typeof value!=='object'||Array.isArray(value))throw 0;return value}catch{throw new CommunityComplaintResponseError('request_body_must_be_object',400)}}
function reply(body,status=200){return new Response(JSON.stringify(body),{status,headers:JSON_HEADERS})}
export class CommunityComplaintResponseError extends Error{constructor(message,status=400){super(message);this.status=status}}
