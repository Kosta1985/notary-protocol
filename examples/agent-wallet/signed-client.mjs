const encoder=new TextEncoder();

export async function importAgentPrivateJwk(jwk){
  if(!jwk||jwk.kty!=='OKP'||jwk.crv!=='Ed25519'||typeof jwk.d!=='string'||typeof jwk.x!=='string')throw new Error('A private Ed25519 JWK is required');
  return crypto.subtle.importKey('jwk',jwk,{name:'Ed25519'},false,['sign']);
}

export async function createSignedAgentRequest({baseUrl,passportId,privateKey,path,method='GET',body,nonce,timestamp,idempotencyKey}){
  if(!passportId||!privateKey)throw new Error('passportId and privateKey are required');
  const base=new URL(baseUrl);
  const target=new URL(path,base);
  if(target.origin!==base.origin)throw new Error('Signed wallet requests must remain on the configured AccordTrace origin');
  const normalizedMethod=String(method).toUpperCase();
  if(!['GET','POST'].includes(normalizedMethod))throw new Error('This example supports GET and POST wallet requests only');
  const rawBody=normalizedMethod==='GET'?'':JSON.stringify(body??{});
  const issuedAt=timestamp||new Date().toISOString();
  const requestNonce=nonce||`req_${crypto.randomUUID().replaceAll('-','')}`;
  const payload={
    domain:'accordtrace.agent.request.v1',
    passport_id:String(passportId),
    timestamp:issuedAt,
    nonce:requestNonce,
    method:normalizedMethod,
    path:target.pathname,
    query:canonicalQuery(target.searchParams),
    body_hash:await sha256Hex(rawBody)
  };
  const signature=new Uint8Array(await crypto.subtle.sign('Ed25519',privateKey,encoder.encode(canonicalize(payload))));
  const headers=new Headers({
    accept:'application/json',
    'x-accord-passport-id':String(passportId),
    'x-accord-timestamp':issuedAt,
    'x-accord-nonce':requestNonce,
    'x-accord-signature':base64url(signature)
  });
  if(normalizedMethod==='POST')headers.set('content-type','application/json');
  if(idempotencyKey)headers.set('idempotency-key',String(idempotencyKey));
  return new Request(target,{method:normalizedMethod,headers,...(normalizedMethod==='POST'?{body:rawBody}:{})});
}

export async function agentWalletJson(options){
  const fetchImpl=options.fetchImpl||fetch;
  const request=await createSignedAgentRequest(options);
  const response=await fetchImpl(request);
  let payload=null;
  try{payload=await response.json();}catch{}
  return{ok:response.ok,status:response.status,body:payload};
}

export async function readWalletCapabilities(baseUrl,fetchImpl=fetch){
  const response=await fetchImpl(new URL('/api/v1/agent/wallet-capabilities',baseUrl),{headers:{accept:'application/json'}});
  if(!response.ok)throw new Error(`Wallet capabilities HTTP ${response.status}`);
  return response.json();
}

export function canonicalize(value){
  if(value===null||typeof value==='boolean'||typeof value==='string'||typeof value==='number')return JSON.stringify(value);
  if(Array.isArray(value))return`[${value.map(canonicalize).join(',')}]`;
  if(value&&typeof value==='object')return`{${Object.keys(value).sort().map(key=>`${JSON.stringify(key)}:${canonicalize(value[key])}`).join(',')}}`;
  throw new Error('Unsupported signed value');
}
function canonicalQuery(params){return[...params.entries()].sort(([ak,av],[bk,bv])=>ak===bk?av.localeCompare(bv):ak.localeCompare(bk)).map(([k,v])=>`${encodeURIComponent(k)}=${encodeURIComponent(v)}`).join('&');}
async function sha256Hex(value){const digest=await crypto.subtle.digest('SHA-256',encoder.encode(String(value)));return[...new Uint8Array(digest)].map(x=>x.toString(16).padStart(2,'0')).join('');}
function base64url(bytes){let raw='';for(const byte of bytes)raw+=String.fromCharCode(byte);return btoa(raw).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');}
