const JSON_HEADERS={"content-type":"application/json; charset=utf-8"};
const MAX_SKEW=10*60*1000;

export async function handleCommunityMigrationLifecycle(request,env,url=new URL(request.url)){
  const actionMatch=url.pathname.match(/^\/api\/v1\/community\/migrations\/([^/]+)\/(complete|cancel)$/);
  if(request.method==='POST'&&actionMatch){
    const migrationId=cleanId(decodeURIComponent(actionMatch[1]),'migration_id');
    const action=actionMatch[2];
    const migration=await env.DB.prepare(`SELECT id,passport_id,destination_origin,export_format,bundle_digest,state FROM community_migration_intents WHERE id=?1`).bind(migrationId).first();
    if(!migration)throw new CommunityMigrationLifecycleError('migration_not_found',404);
    if(migration.state!=='created')throw new CommunityMigrationLifecycleError('migration_not_actionable',409);
    const passport=await activePassport(env,migration.passport_id);
    const body=await bodyJson(request);
    const requestId=cleanId(body.request_id,'request_id');
    const actedAt=freshIso(body.acted_at);
    const receiptDigest=action==='complete'?hexDigest(body.destination_receipt_digest,'destination_receipt_digest'):null;
    const payload={
      domain:`accordtrace.community.migration.${action}.v1`,
      request_id:requestId,
      migration_id:migration.id,
      passport_id:passport.id,
      destination_origin:migration.destination_origin,
      bundle_digest:migration.bundle_digest,
      destination_receipt_digest:receiptDigest,
      acted_at:actedAt
    };
    await verifyEd25519(passport.public_key,canonicalize(payload),body.signature);
    const eventType=action==='complete'?'migration_completed':'migration_cancelled';
    const eventDigest=await sha256Hex(canonicalize({...payload,event_type:eventType}));
    const auditId=`cae_${randomHex(16)}`;
    const targetState=action==='complete'?'completed':'cancelled';
    if(typeof env.DB.batch!=='function')throw new CommunityMigrationLifecycleError('atomic_batch_unavailable',503);
    let results;
    try{
      results=await env.DB.batch([
        env.DB.prepare(`UPDATE community_migration_intents SET state=?1,completed_at=CASE WHEN ?1='completed' THEN ?2 ELSE completed_at END,destination_receipt_digest=CASE WHEN ?1='completed' THEN ?3 ELSE destination_receipt_digest END WHERE id=?4 AND state='created'`).bind(targetState,actedAt,receiptDigest,migration.id),
        env.DB.prepare(`INSERT INTO community_audit_events(id,event_type,passport_id,subject_ref,actor_kind,event_digest,created_at) SELECT ?1,?2,?3,?4,'passport',?5,?6 WHERE EXISTS(SELECT 1 FROM community_migration_intents WHERE id=?4 AND state=?7)`).bind(auditId,eventType,passport.id,migration.id,eventDigest,actedAt,targetState)
      ]);
    }catch{throw new CommunityMigrationLifecycleError('migration_transition_conflict',409)}
    if(Number(results?.[0]?.meta?.changes??0)!==1||Number(results?.[1]?.meta?.changes??0)!==1)throw new CommunityMigrationLifecycleError('migration_transition_race_lost',409);
    return reply({migration_id:migration.id,state:targetState,acted_at:actedAt,destination_receipt_digest:receiptDigest,audit:{id:auditId,event_type:eventType,event_digest:eventDigest},secret_material_included:false,funds_included:false});
  }

  const auditMatch=url.pathname.match(/^\/api\/v1\/community\/migrations\/([^/]+)\/audit$/);
  if(request.method==='GET'&&auditMatch){
    const migrationId=cleanId(decodeURIComponent(auditMatch[1]),'migration_id');
    const migration=await env.DB.prepare(`SELECT id,passport_id,state FROM community_migration_intents WHERE id=?1`).bind(migrationId).first();
    if(!migration)return reply({error:'migration_not_found'},404);
    const rows=await env.DB.prepare(`SELECT id,event_type,passport_id,actor_kind,event_digest,created_at FROM community_audit_events WHERE subject_ref=?1 ORDER BY created_at,id`).bind(migrationId).all();
    return reply({migration:{id:migration.id,passport_id:migration.passport_id,state:migration.state},events:rows.results||[],boundary:'Audit events prove recorded AccordTrace lifecycle actions only; they do not transfer private keys, credentials, wallets or funds.'});
  }

  return null;
}

async function activePassport(env,id){const row=await env.DB.prepare(`SELECT id,public_key,status FROM agent_passports WHERE id=?1`).bind(id).first();if(!row||row.status!=='active')throw new CommunityMigrationLifecycleError('passport_not_active',404);return row}
function freshIso(value){const t=Date.parse(value);if(!Number.isFinite(t)||Math.abs(Date.now()-t)>MAX_SKEW)throw new CommunityMigrationLifecycleError('timestamp_out_of_range',400);return new Date(t).toISOString()}
function cleanId(value,name){const s=String(value||'').trim();if(!/^[A-Za-z0-9][A-Za-z0-9._:-]{0,199}$/.test(s))throw new CommunityMigrationLifecycleError(`${name}_invalid`,400);return s}
function hexDigest(value,name){const s=String(value||'').toLowerCase();if(!/^[a-f0-9]{64}$/.test(s))throw new CommunityMigrationLifecycleError(`${name}_invalid`,400);return s}
function randomHex(n){const b=crypto.getRandomValues(new Uint8Array(n));return[...b].map(x=>x.toString(16).padStart(2,'0')).join('')}
async function sha256Hex(value){const d=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(String(value)));return[...new Uint8Array(d)].map(x=>x.toString(16).padStart(2,'0')).join('')}
async function verifyEd25519(pem,message,signature){let key;try{key=await crypto.subtle.importKey('spki',pemBytes(pem),{name:'Ed25519'},false,['verify'])}catch{throw new CommunityMigrationLifecycleError('invalid_public_key',422)}let ok=false;try{ok=await crypto.subtle.verify({name:'Ed25519'},key,b64(signature),new TextEncoder().encode(message))}catch{}if(!ok)throw new CommunityMigrationLifecycleError('signature_verification_failed',401)}
function pemBytes(pem){const b=String(pem||'').replace(/-----BEGIN PUBLIC KEY-----|-----END PUBLIC KEY-----|\s/g,'');return Uint8Array.from(atob(b),c=>c.charCodeAt(0))}
function b64(value){const n=String(value||'').replace(/-/g,'+').replace(/_/g,'/');return Uint8Array.from(atob(n+'='.repeat((4-n.length%4)%4)),c=>c.charCodeAt(0))}
function canonicalize(value){if(value===null||typeof value==='boolean'||typeof value==='string'||typeof value==='number')return JSON.stringify(value);if(Array.isArray(value))return`[${value.map(canonicalize).join(',')}]`;if(typeof value==='object')return`{${Object.keys(value).sort().map(k=>`${JSON.stringify(k)}:${canonicalize(value[k])}`).join(',')}}`;throw new CommunityMigrationLifecycleError('unsupported_value',400)}
async function bodyJson(request){try{const value=await request.json();if(!value||typeof value!=='object'||Array.isArray(value))throw 0;return value}catch{throw new CommunityMigrationLifecycleError('request_body_must_be_object',400)}}
function reply(body,status=200){return new Response(JSON.stringify(body),{status,headers:JSON_HEADERS})}
export class CommunityMigrationLifecycleError extends Error{constructor(message,status=400){super(message);this.status=status}}
