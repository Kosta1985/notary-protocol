const MAX_BODY_BYTES=64*1024;
const MAX_CLOCK_SKEW_MS=5*60*1000;

export class AgentRequestError extends Error{constructor(code,status=400,message=code){super(message);this.code=code;this.status=status;}}

export async function authenticateAgentRequest(request,env,url=new URL(request.url)){
  const passportId=header(request,'x-accord-passport-id');
  const timestamp=header(request,'x-accord-timestamp');
  const nonce=header(request,'x-accord-nonce');
  const signature=header(request,'x-accord-signature');
  if(!passportId||!timestamp||!nonce||!signature)throw new AgentRequestError('SIGNED_AGENT_REQUEST_REQUIRED',401,'Signed agent request headers are required.');
  if(!/^[A-Za-z0-9][A-Za-z0-9._:-]{0,199}$/.test(passportId))throw new AgentRequestError('INVALID_PASSPORT_ID',400);
  if(!/^[A-Za-z0-9][A-Za-z0-9._:-]{7,199}$/.test(nonce))throw new AgentRequestError('INVALID_NONCE',400);
  const time=Date.parse(timestamp);if(!Number.isFinite(time)||Math.abs(Date.now()-time)>MAX_CLOCK_SKEW_MS)throw new AgentRequestError('TIMESTAMP_OUT_OF_RANGE',401);
  const rawBody=(request.method==='GET'||request.method==='HEAD')?'':await readBoundedBody(request);
  const bodyHash=await sha256Hex(rawBody);
  const query=canonicalQuery(url.searchParams);
  const signedPayload={domain:'accordtrace.agent.request.v1',passport_id:passportId,timestamp,nonce,method:request.method.toUpperCase(),path:url.pathname,query,body_hash:bodyHash};
  const passport=await env.DB.prepare(`SELECT id,public_key,status FROM agent_passports WHERE id=?1`).bind(passportId).first();
  if(!passport)throw new AgentRequestError('PASSPORT_NOT_FOUND',404);
  if(passport.status!=='active')throw new AgentRequestError('PASSPORT_NOT_ACTIVE',403);
  await verifyEd25519(passport.public_key,canonicalize(signedPayload),signature);
  return{passport,passportId,timestamp,nonce,rawBody,bodyHash,query,requestDigest:await sha256Hex(canonicalize(signedPayload)),signedPayload};
}

export async function reserveAgentNonce(env,auth){
  const inserted=await env.DB.prepare(`INSERT OR IGNORE INTO agent_wallet_request_nonces (passport_id,nonce,request_digest,first_seen_at) VALUES (?1,?2,?3,?4)`).bind(auth.passportId,auth.nonce,auth.requestDigest,new Date().toISOString()).run();
  if((inserted.meta?.changes??1)===0)throw new AgentRequestError('REQUEST_REPLAY_DETECTED',409,'This signed nonce has already been used.');
}

export function parseSignedJson(auth){
  if(!auth.rawBody)return{};
  let body;try{body=JSON.parse(auth.rawBody);}catch{throw new AgentRequestError('REQUEST_BODY_MUST_BE_JSON',400);}
  if(!body||typeof body!=='object'||Array.isArray(body))throw new AgentRequestError('REQUEST_BODY_MUST_BE_OBJECT',400);
  return body;
}

export function canonicalize(value){
  if(value===null||typeof value==='boolean'||typeof value==='string'||typeof value==='number')return JSON.stringify(value);
  if(Array.isArray(value))return`[${value.map(canonicalize).join(',')}]`;
  if(value&&typeof value==='object')return`{${Object.keys(value).sort().map(key=>`${JSON.stringify(key)}:${canonicalize(value[key])}`).join(',')}}`;
  throw new AgentRequestError('UNSUPPORTED_SIGNED_VALUE',400);
}

export async function sha256Hex(value){const digest=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(String(value)));return[...new Uint8Array(digest)].map(x=>x.toString(16).padStart(2,'0')).join('');}

async function readBoundedBody(request){const text=await request.text();if(new TextEncoder().encode(text).byteLength>MAX_BODY_BYTES)throw new AgentRequestError('REQUEST_BODY_TOO_LARGE',413);return text;}
function canonicalQuery(params){return [...params.entries()].sort(([ak,av],[bk,bv])=>ak===bk?av.localeCompare(bv):ak.localeCompare(bk)).map(([k,v])=>`${encodeURIComponent(k)}=${encodeURIComponent(v)}`).join('&');}
function header(request,name){return String(request.headers.get(name)||'').trim();}
async function verifyEd25519(pem,message,signature){let key;try{key=await crypto.subtle.importKey('spki',pemBytes(pem),{name:'Ed25519'},false,['verify']);}catch{throw new AgentRequestError('INVALID_AGENT_PUBLIC_KEY',422);}let ok=false;try{ok=await crypto.subtle.verify({name:'Ed25519'},key,decodeBase64Url(signature),new TextEncoder().encode(message));}catch{}if(!ok)throw new AgentRequestError('AGENT_SIGNATURE_INVALID',401);}
function pemBytes(pem){const body=String(pem||'').replace(/-----BEGIN PUBLIC KEY-----|-----END PUBLIC KEY-----|\s/g,'');try{return Uint8Array.from(atob(body),c=>c.charCodeAt(0));}catch{throw new AgentRequestError('INVALID_AGENT_PUBLIC_KEY',422);}}
function decodeBase64Url(value){const normalized=String(value||'').replace(/-/g,'+').replace(/_/g,'/');try{return Uint8Array.from(atob(normalized+'='.repeat((4-normalized.length%4)%4)),c=>c.charCodeAt(0));}catch{throw new AgentRequestError('AGENT_SIGNATURE_INVALID',401);}}
