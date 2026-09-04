const JSON_HEADERS={"content-type":"application/json; charset=utf-8"};
const CHALLENGE_TTL_MS=30*60*1000;

export async function handleValidationDns(request,env,url=new URL(request.url)){
  if(!url.pathname.startsWith('/api/v1/validation/'))return null;

  if(request.method==='POST'&&url.pathname==='/api/v1/validation/domain/challenges'){
    const b=await bodyJson(request);
    const row=await env.DB.prepare(`SELECT id,subject_passport_id,validation_type,subject_ref,status FROM validation_requests WHERE id=?1`).bind(cleanId(b.request_id,'request_id')).first();
    if(!row)return reply({error:'validation_request_not_found'},404);
    if(row.validation_type!=='domain_control')return reply({error:'validation_request_not_domain_control'},422);
    if(row.status!=='pending')return reply({error:'validation_request_not_pending'},409);
    if(row.subject_passport_id!==String(b.subject_passport_id||''))return reply({error:'subject_mismatch'},403);
    const domain=normalizeDomain(row.subject_ref);
    const token=randomToken();
    const record=`accordtrace-validation=${token}`;
    const now=new Date(); const expires=new Date(now.getTime()+CHALLENGE_TTL_MS);
    const challengeDigest=await sha256Hex(`accordtrace.validation.domain.challenge.v1:${row.id}:${domain}:${token}`);
    const recordValueDigest=await sha256Hex(`accordtrace.validation.domain.record.v1:${record}`);
    const dnsName=`_accordtrace.${domain}`;
    const existing=await env.DB.prepare(`SELECT request_id FROM validation_domain_challenges WHERE request_id=?1`).bind(row.id).first();
    if(existing)return reply({error:'domain_challenge_already_exists'},409);
    await env.DB.prepare(`INSERT INTO validation_domain_challenges (request_id,subject_passport_id,domain_name,dns_name,record_value_digest,challenge_digest,issued_at,expires_at,created_at,updated_at) VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?7,?7)`).bind(row.id,row.subject_passport_id,domain,dnsName,recordValueDigest,challengeDigest,now.toISOString(),expires.toISOString()).run();
    await env.DB.prepare(`UPDATE validation_requests SET challenge_digest=?1,challenge_expires_at=?2,updated_at=?3 WHERE id=?4`).bind(challengeDigest,expires.toISOString(),now.toISOString(),row.id).run();
    return reply({request_id:row.id,dns:{name:dnsName,type:'TXT',value:record},challenge_digest:challengeDigest,expires_at:expires.toISOString(),privacy:'Only hashes are persisted; the raw challenge token is returned once.'},201);
  }

  if(request.method==='POST'&&url.pathname==='/api/v1/validation/domain/verify'){
    const b=await bodyJson(request); const id=cleanId(b.request_id,'request_id');
    const c=await env.DB.prepare(`SELECT * FROM validation_domain_challenges WHERE request_id=?1`).bind(id).first();
    if(!c)return reply({error:'domain_challenge_not_found'},404);
    if(c.verified_at)return reply({request_id:id,status:'already_verified',evidence_digest:c.evidence_digest,verified_at:c.verified_at});
    if(Date.parse(c.expires_at)<=Date.now())return reply({error:'domain_challenge_expired'},409);
    const token=String(b.challenge_token||'').trim(); if(!/^[a-f0-9]{64}$/.test(token))throw new ValidationDnsError('challenge_token_invalid',400);
    const record=`accordtrace-validation=${token}`;
    const digest=await sha256Hex(`accordtrace.validation.domain.record.v1:${record}`);
    if(digest!==c.record_value_digest)return reply({error:'challenge_token_mismatch'},403);
    const resolverUrl=new URL('https://dns.google/resolve'); resolverUrl.searchParams.set('name',c.dns_name); resolverUrl.searchParams.set('type','TXT');
    let data; try{const r=await fetch(resolverUrl,{headers:{accept:'application/dns-json'},redirect:'error'}); if(!r.ok)throw new Error(`http_${r.status}`); data=await r.json();}catch{throw new ValidationDnsError('dns_resolver_unavailable',502);}
    const answers=Array.isArray(data.Answer)?data.Answer:[];
    const txts=answers.filter(x=>Number(x.type)===16).map(x=>unquoteTxt(x.data));
    if(!txts.includes(record))return reply({error:'dns_challenge_not_found',dns_name:c.dns_name},409);
    const observedDigest=await sha256Hex(canonicalize({dns_name:c.dns_name,record_value_digest:c.record_value_digest,resolver:'dns.google',dnssec_authenticated:Boolean(data.AD)}));
    const evidenceDigest=await sha256Hex(`accordtrace.validation.domain.evidence.v1:${c.request_id}:${c.domain_name}:${observedDigest}`);
    const now=new Date().toISOString();
    await env.DB.prepare(`UPDATE validation_domain_challenges SET verified_at=?1,evidence_digest=?2,resolver='dns.google',dnssec_authenticated=?3,updated_at=?1 WHERE request_id=?4 AND verified_at IS NULL`).bind(now,evidenceDigest,data.AD?1:0,id).run();
    return reply({request_id:id,status:'dns_control_verified',domain:c.domain_name,evidence_digest:evidenceDigest,verified_at:now,dnssec_authenticated:Boolean(data.AD),next_step:'A qualified validator must sign the final passed result using this exact evidence_digest.'});
  }

  if(request.method==='GET'&&url.pathname==='/api/v1/validation/stats'){
    const [products,requests,outcomes,subjects,validators,domains]=await Promise.all([
      env.DB.prepare(`SELECT COUNT(*) AS n FROM validation_products WHERE status='active'`).first(),
      env.DB.prepare(`SELECT COUNT(*) AS total,SUM(CASE WHEN status='pending' THEN 1 ELSE 0 END) AS pending,SUM(CASE WHEN status='completed' THEN 1 ELSE 0 END) AS completed FROM validation_requests`).first(),
      env.DB.prepare(`SELECT SUM(CASE WHEN outcome='passed' THEN 1 ELSE 0 END) AS passed,SUM(CASE WHEN outcome='failed' THEN 1 ELSE 0 END) AS failed,SUM(CASE WHEN outcome='inconclusive' THEN 1 ELSE 0 END) AS inconclusive FROM validation_requests WHERE status='completed'`).first(),
      env.DB.prepare(`SELECT COUNT(DISTINCT subject_passport_id) AS n FROM validation_requests`).first(),
      env.DB.prepare(`SELECT COUNT(DISTINCT validator_passport_id) AS n FROM validation_products WHERE status='active'`).first(),
      env.DB.prepare(`SELECT COUNT(*) AS issued,SUM(CASE WHEN verified_at IS NOT NULL THEN 1 ELSE 0 END) AS verified FROM validation_domain_challenges`).first()
    ]);
    return reply({service:'AccordTrace Validation Marketplace',privacy:'Aggregate counts only; no IP addresses, payment payloads, raw DNS challenge tokens or private subject refs.',products:{active:Number(products?.n||0)},requests:{total:Number(requests?.total||0),pending:Number(requests?.pending||0),completed:Number(requests?.completed||0)},outcomes:{passed:Number(outcomes?.passed||0),failed:Number(outcomes?.failed||0),inconclusive:Number(outcomes?.inconclusive||0)},participants:{distinct_subject_passports:Number(subjects?.n||0),distinct_validator_passports:Number(validators?.n||0)},domain_challenges:{issued:Number(domains?.issued||0),verified:Number(domains?.verified||0)},trust_score:null});
  }
  return null;
}

function normalizeDomain(v){const s=String(v||'').toLowerCase().replace(/^https?:\/\//,'').split('/')[0].replace(/\.$/,'');if(!/^(?=.{1,253}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/.test(s))throw new ValidationDnsError('invalid_domain',400);return s;}
function cleanId(v,n){const s=String(v||'').trim();if(!/^[A-Za-z0-9][A-Za-z0-9._:-]{0,199}$/.test(s))throw new ValidationDnsError(`${n}_invalid`,400);return s;}
function randomToken(){const b=crypto.getRandomValues(new Uint8Array(32));return[...b].map(x=>x.toString(16).padStart(2,'0')).join('');}
function unquoteTxt(v){const s=String(v||'');return s.replace(/^"|"$/g,'').replace(/"\s*"/g,'');}
async function sha256Hex(v){const b=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(String(v)));return[...new Uint8Array(b)].map(x=>x.toString(16).padStart(2,'0')).join('');}
function canonicalize(v){if(v===null||typeof v==='boolean'||typeof v==='string'||typeof v==='number')return JSON.stringify(v);if(Array.isArray(v))return`[${v.map(canonicalize).join(',')}]`;return`{${Object.keys(v).sort().map(k=>`${JSON.stringify(k)}:${canonicalize(v[k])}`).join(',')}}`;}
async function bodyJson(r){try{return await r.json();}catch{throw new ValidationDnsError('request_body_must_be_json',400);}}
function reply(b,s=200){return new Response(JSON.stringify(b),{status:s,headers:JSON_HEADERS});}
export class ValidationDnsError extends Error{constructor(message,status=400){super(message);this.status=status;}}
