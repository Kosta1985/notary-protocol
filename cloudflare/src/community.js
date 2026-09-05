const JSON_HEADERS={"content-type":"application/json; charset=utf-8"};
const MAX_SKEW=10*60*1000;
const TIERS=['passport_holder','resident','citizen'];
const COMPLAINT_CATEGORIES=['conduct','payment','misrepresentation','security','spam','other'];

export async function handleCommunity(request,env,url=new URL(request.url)){
  if(!url.pathname.startsWith('/api/v1/community/'))return null;

  if(request.method==='GET'&&url.pathname==='/api/v1/community/capabilities')return reply({
    service:'AccordTrace Community & Portability',version:'0.1.0',
    membership_tiers:TIERS,
    membership_boundary:'Resident and Citizen are private AccordTrace membership labels only. They are not nationality, immigration status, legal residency, government identity or KYC.',
    complaints_boundary:'A submitted complaint is an allegation and audit record only. It does not alter Trust, reputation, wallet access or Passport status unless a separate evidence-based process explicitly does so.',
    portability_boundary:'Portability moves public identity evidence and continuity references, never private keys, wallet secrets, credentials or funds.',
    features:['private_membership_requests','reviewed_membership_decisions','evidence_digest_complaints','public_complaint_summary','signed_migration_intents','portable_public_bundle']
  });

  const memberMatch=url.pathname.match(/^\/api\/v1\/community\/passports\/([^/]+)\/membership$/);
  if(request.method==='GET'&&memberMatch){
    const passportId=cleanId(decodeURIComponent(memberMatch[1]),'passport_id');await activePassport(env,passportId);
    const row=await env.DB.prepare(`SELECT tier,state,granted_at,updated_at FROM community_memberships WHERE passport_id=?1`).bind(passportId).first();
    return reply({passport_id:passportId,membership:row||{tier:'passport_holder',state:'active',granted_at:null,updated_at:null},legal_status_effect:false,trust_effect:false});
  }

  if(request.method==='POST'&&url.pathname==='/api/v1/community/membership-requests'){
    const b=await bodyJson(request);const passport=await activePassport(env,cleanId(b.passport_id,'passport_id'));
    const tier=String(b.requested_tier||'');if(!['resident','citizen'].includes(tier))throw new CommunityError('requested_tier_invalid',400);
    const requestId=cleanId(b.request_id,'request_id'),requestedAt=freshIso(b.requested_at);
    const payload={domain:'accordtrace.community.membership.request.v1',request_id:requestId,passport_id:passport.id,requested_tier:tier,requested_at:requestedAt};
    await verifyEd25519(passport.public_key,canonicalize(payload),b.signature);
    const id=`cmr_${randomHex(16)}`;
    try{await env.DB.prepare(`INSERT INTO community_membership_requests(id,passport_id,requested_tier,state,request_id,requested_at) VALUES(?1,?2,?3,'pending',?4,?5)`).bind(id,passport.id,tier,requestId,requestedAt).run();}
    catch{throw new CommunityError('membership_request_conflict',409)}
    return reply({request:{id,passport_id:passport.id,requested_tier:tier,state:'pending',requested_at:requestedAt},boundary:'Approval grants a private AccordTrace membership label only.'},201);
  }

  const decisionMatch=url.pathname.match(/^\/api\/v1\/community\/admin\/membership-requests\/([^/]+)\/(approve|deny)$/);
  if(request.method==='POST'&&decisionMatch){
    requireAdmin(request,env);const id=cleanId(decodeURIComponent(decisionMatch[1]),'request_id');const action=decisionMatch[2];const b=await bodyJson(request);const reason=text(b.reason,240)||null;
    const row=await env.DB.prepare(`SELECT * FROM community_membership_requests WHERE id=?1`).bind(id).first();if(!row)throw new CommunityError('membership_request_not_found',404);if(row.state!=='pending')throw new CommunityError('membership_request_not_pending',409);
    const now=new Date().toISOString();
    if(action==='approve'){
      await env.DB.prepare(`INSERT INTO community_memberships(passport_id,tier,state,granted_at,updated_at) VALUES(?1,?2,'active',?3,?3) ON CONFLICT(passport_id) DO UPDATE SET tier=excluded.tier,state='active',granted_at=excluded.granted_at,updated_at=excluded.updated_at`).bind(row.passport_id,row.requested_tier,now).run();
      await env.DB.prepare(`UPDATE community_membership_requests SET state='approved',decided_at=?1,decision_reason=?2 WHERE id=?3 AND state='pending'`).bind(now,reason,id).run();
    }else await env.DB.prepare(`UPDATE community_membership_requests SET state='denied',decided_at=?1,decision_reason=?2 WHERE id=?3 AND state='pending'`).bind(now,reason,id).run();
    return reply({request_id:id,state:action==='approve'?'approved':'denied',decided_at:now,legal_status_effect:false,trust_effect:false});
  }

  if(request.method==='POST'&&url.pathname==='/api/v1/community/complaints'){
    const b=await bodyJson(request);const complainant=await activePassport(env,cleanId(b.complainant_passport_id,'complainant_passport_id'));const target=await activePassport(env,cleanId(b.target_passport_id,'target_passport_id'));
    if(complainant.id===target.id)throw new CommunityError('self_complaint_not_allowed',422);
    const category=String(b.category||'');if(!COMPLAINT_CATEGORIES.includes(category))throw new CommunityError('complaint_category_invalid',400);
    const evidenceDigest=hexDigest(b.evidence_digest),requestId=cleanId(b.request_id,'request_id'),submittedAt=freshIso(b.submitted_at);
    const payload={domain:'accordtrace.community.complaint.v1',request_id:requestId,complainant_passport_id:complainant.id,target_passport_id:target.id,category,evidence_digest:evidenceDigest,submitted_at:submittedAt};
    await verifyEd25519(complainant.public_key,canonicalize(payload),b.signature);
    const id=`cmp_${randomHex(16)}`;
    try{await env.DB.prepare(`INSERT INTO community_complaints(id,complainant_passport_id,target_passport_id,category,evidence_digest,state,request_id,submitted_at) VALUES(?1,?2,?3,?4,?5,'submitted',?6,?7)`).bind(id,complainant.id,target.id,category,evidenceDigest,requestId,submittedAt).run();}
    catch{throw new CommunityError('complaint_request_conflict',409)}
    return reply({complaint:{id,state:'submitted',category,evidence_digest:evidenceDigest,submitted_at:submittedAt},presumption:'allegation_only',automatic_trust_effect:false,automatic_enforcement:false},201);
  }

  const complaintSummary=url.pathname.match(/^\/api\/v1\/community\/passports\/([^/]+)\/complaints-summary$/);
  if(request.method==='GET'&&complaintSummary){
    const passportId=cleanId(decodeURIComponent(complaintSummary[1]),'passport_id');await activePassport(env,passportId);
    const rows=await env.DB.prepare(`SELECT state,COUNT(*) AS count FROM community_complaints WHERE target_passport_id=?1 GROUP BY state`).bind(passportId).all();
    return reply({passport_id:passportId,complaints:rows.results||[],meaning:'Counts are allegations/review outcomes, not a Trust Score or proof of misconduct.',automatic_trust_effect:false});
  }

  const complaintDecision=url.pathname.match(/^\/api\/v1\/community\/admin\/complaints\/([^/]+)\/(review|dismiss|uphold|close)$/);
  if(request.method==='POST'&&complaintDecision){
    requireAdmin(request,env);const id=cleanId(decodeURIComponent(complaintDecision[1]),'complaint_id');const action=complaintDecision[2];const b=await bodyJson(request);const resolution=text(b.resolution_code,120)||null;const now=new Date().toISOString();
    const state={review:'reviewing',dismiss:'dismissed',uphold:'upheld',close:'closed'}[action];
    const result=await env.DB.prepare(`UPDATE community_complaints SET state=?1,reviewed_at=?2,resolution_code=?3 WHERE id=?4 AND state IN ('submitted','reviewing','upheld','dismissed')`).bind(state,now,resolution,id).run();
    if(!(result.meta?.changes>0))throw new CommunityError('complaint_not_actionable',409);
    return reply({complaint_id:id,state,reviewed_at:now,automatic_trust_effect:false,automatic_enforcement:false});
  }

  if(request.method==='POST'&&url.pathname==='/api/v1/community/migrations'){
    const b=await bodyJson(request);const passport=await activePassport(env,cleanId(b.passport_id,'passport_id'));const requestId=cleanId(b.request_id,'request_id'),createdAt=freshIso(b.created_at);const destinationOrigin=normalizeOrigin(b.destination_origin);
    const membership=await env.DB.prepare(`SELECT tier,state,granted_at FROM community_memberships WHERE passport_id=?1`).bind(passport.id).first();
    const bundle={format:'accordtrace-portable-passport-v1',passport:{id:passport.id,public_key:passport.public_key,status:passport.status},membership:membership||{tier:'passport_holder',state:'active',granted_at:null},issued_at:createdAt,private_material_included:false,funds_included:false};
    const bundleDigest=await sha256Hex(canonicalize(bundle));
    const payload={domain:'accordtrace.community.migration.intent.v1',request_id:requestId,passport_id:passport.id,destination_origin:destinationOrigin,export_format:bundle.format,bundle_digest:bundleDigest,created_at:createdAt};
    await verifyEd25519(passport.public_key,canonicalize(payload),b.signature);
    const id=`mig_${randomHex(16)}`;
    try{await env.DB.prepare(`INSERT INTO community_migration_intents(id,passport_id,destination_origin,export_format,bundle_digest,state,request_id,created_at) VALUES(?1,?2,?3,?4,?5,'created',?6,?7)`).bind(id,passport.id,destinationOrigin,bundle.format,bundleDigest,requestId,createdAt).run();}
    catch{throw new CommunityError('migration_request_conflict',409)}
    return reply({migration:{id,passport_id:passport.id,destination_origin:destinationOrigin,state:'created',bundle_digest:bundleDigest},bundle,boundary:'The agent retains its own private key. AccordTrace exports no secret key, credential, wallet secret or funds.'},201);
  }

  const migrationMatch=url.pathname.match(/^\/api\/v1\/community\/migrations\/([^/]+)$/);
  if(request.method==='GET'&&migrationMatch){const id=cleanId(decodeURIComponent(migrationMatch[1]),'migration_id');const row=await env.DB.prepare(`SELECT id,passport_id,destination_origin,export_format,bundle_digest,state,created_at,completed_at,destination_receipt_digest FROM community_migration_intents WHERE id=?1`).bind(id).first();return row?reply({migration:row,secret_material_included:false,funds_included:false}):reply({error:'migration_not_found'},404);}

  return reply({error:'not_found'},404);
}

async function activePassport(env,id){const row=await env.DB.prepare(`SELECT id,public_key,status FROM agent_passports WHERE id=?1`).bind(id).first();if(!row||row.status!=='active')throw new CommunityError('passport_not_active',404);return row}
function requireAdmin(request,env){const expected=String(env.COMMUNITY_ADMIN_TOKEN||'');if(!expected)throw new CommunityError('community_admin_disabled',503);const auth=String(request.headers.get('authorization')||'');if(auth!==`Bearer ${expected}`)throw new CommunityError('community_admin_unauthorized',401)}
function normalizeOrigin(value){let u;try{u=new URL(String(value||''))}catch{throw new CommunityError('destination_origin_invalid',400)}if(u.protocol!=='https:')throw new CommunityError('destination_origin_https_required',400);return u.origin}
function freshIso(v){const t=Date.parse(v);if(!Number.isFinite(t)||Math.abs(Date.now()-t)>MAX_SKEW)throw new CommunityError('timestamp_out_of_range',400);return new Date(t).toISOString()}
function cleanId(v,n){const s=String(v||'').trim();if(!/^[A-Za-z0-9][A-Za-z0-9._:-]{0,199}$/.test(s))throw new CommunityError(`${n}_invalid`,400);return s}
function text(v,n){return String(v??'').trim().slice(0,n)}
function hexDigest(v){const s=String(v||'').toLowerCase();if(!/^[a-f0-9]{64}$/.test(s))throw new CommunityError('evidence_digest_invalid',400);return s}
function randomHex(n){const b=crypto.getRandomValues(new Uint8Array(n));return[...b].map(x=>x.toString(16).padStart(2,'0')).join('')}
async function sha256Hex(v){const d=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(String(v)));return[...new Uint8Array(d)].map(x=>x.toString(16).padStart(2,'0')).join('')}
async function verifyEd25519(pem,msg,sig){let k;try{k=await crypto.subtle.importKey('spki',pemBytes(pem),{name:'Ed25519'},false,['verify'])}catch{throw new CommunityError('invalid_public_key',422)}let ok=false;try{ok=await crypto.subtle.verify({name:'Ed25519'},k,b64(sig),new TextEncoder().encode(msg))}catch{}if(!ok)throw new CommunityError('signature_verification_failed',401)}
function pemBytes(p){const b=String(p||'').replace(/-----BEGIN PUBLIC KEY-----|-----END PUBLIC KEY-----|\s/g,'');return Uint8Array.from(atob(b),c=>c.charCodeAt(0))}
function b64(v){const n=String(v||'').replace(/-/g,'+').replace(/_/g,'/');return Uint8Array.from(atob(n+'='.repeat((4-n.length%4)%4)),c=>c.charCodeAt(0))}
function canonicalize(v){if(v===null||typeof v==='boolean'||typeof v==='string'||typeof v==='number')return JSON.stringify(v);if(Array.isArray(v))return`[${v.map(canonicalize).join(',')}]`;if(typeof v==='object')return`{${Object.keys(v).sort().map(k=>`${JSON.stringify(k)}:${canonicalize(v[k])}`).join(',')}}`;throw new CommunityError('unsupported_value',400)}
async function bodyJson(r){try{return await r.json()}catch{throw new CommunityError('request_body_must_be_json',400)}}
function reply(body,status=200){return new Response(JSON.stringify(body),{status,headers:JSON_HEADERS})}
export class CommunityError extends Error{constructor(message,status=400){super(message);this.status=status}}
