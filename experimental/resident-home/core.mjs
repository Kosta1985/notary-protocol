/** Offline reference implementation. NOT a deployable Worker or a billing service. */
import { createHash, randomBytes, randomUUID, createCipheriv, createDecipheriv } from 'node:crypto';

export const FLAGS = Object.freeze({ resident_home: false, new_residency_billing: false,
  hosted_compute: false, wallets: false, referrals: false, auto_migration: false, outgoing_webhooks: false });
export const MAX_BODY = 4 * 1024 * 1024;
export const MAX_MESSAGE = 32000;
export const DEFAULT_LIMITS = Object.freeze({ primary_bytes: 2_000_000_000, requests: 20000,
  ingress_bytes: 10_000_000_000, messages: 1000, objects: 1100, writes: 3000, reads: 10000,
  projected_cost_micro_aud: 0, maintenance_requests: 100, maintenance_reads: 100 });
const ENCRYPTION_OVERHEAD = 32; // version(4) + random nonce(12) + GCM tag(16)
const ID = /^[A-Za-z0-9_-]{1,80}$/;
const RESOURCE = new Set(Object.keys(DEFAULT_LIMITS));
const CODE = Object.freeze({ DISABLED: [503,'Resident Home is not activated.'],
  UNAUTHORIZED: [401,'A current scoped session is required.'], NOT_FOUND: [404,'Resource not found.'],
  FORBIDDEN: [403,'This operation is not permitted.'], INVALID: [400,'Invalid request.'],
  TOO_LARGE: [413,'Request exceeds the byte limit.'], TIMEOUT: [408,'Request body timed out.'],
  QUOTA: [429,'Quota exhausted.'], ACCOUNTING_UNAVAILABLE: [503,'Accounting is unavailable.'],
  CONFLICT: [409,'Idempotency key conflicts with an earlier request.'],
  PENDING: [409,'The operation is pending reconciliation.'], EXPIRED: [409,'Reservation expired.'],
  CORRUPT: [422,'Stored data failed integrity checks.'], INCOMPATIBLE: [422,'Runtime is not supported.'],
  LAST_SNAPSHOT: [409,'The last current snapshot cannot be deleted.'], CAPACITY: [503,'Local database capacity guard is closed.'],
  METHOD: [405,'Method is not allowed.'], INTERNAL: [503,'The operation could not be completed.'] });
export class HomeError extends Error {
  constructor(code, resetAt = null) { super(CODE[code]?.[1] || CODE.INTERNAL[1]); this.code=code; this.resetAt=resetAt; }
}
const fail = (code, resetAt) => { throw new HomeError(code,resetAt); };
export const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');
const isObject = value => value !== null && typeof value==='object' && !Array.isArray(value);
function exact(value, keys) {
  if (!isObject(value) || Object.keys(value).some(k=>!keys.includes(k)) || keys.some(k=>!Object.hasOwn(value,k))) fail('INVALID');
}
export function validateState(state) {
  exact(state,['schema_version','counter','step','completed_operations']);
  if(state.schema_version!=='1.0' || !Number.isSafeInteger(state.counter) || state.counter<0 ||
    !Number.isSafeInteger(state.step) || state.step<0 || !Array.isArray(state.completed_operations) ||
    state.completed_operations.length>1024 || state.completed_operations.some(id=>typeof id!=='string'||!/^op_[a-f0-9]{32}$/.test(id)) ||
    new Set(state.completed_operations).size!==state.completed_operations.length) fail('INVALID');
  return {schema_version:'1.0',counter:state.counter,step:state.step,completed_operations:[...state.completed_operations]};
}
function json(value) { return Buffer.from(JSON.stringify(value),'utf8'); }
function manifestFor(agent,id,state,bytes,now) {
  return {schema_version:'1.0',tenant_id:agent.tenant_id,agent_id:agent.agent_id,snapshot_id:id,
    created_at:new Date(now).toISOString(),framework:{name:'accord-counter',version:'1.0.0'},
    required_runtime:'node>=22.16',last_consistent_step:state.step,
    objects:[{name:'state.json',bytes:bytes.length,sha256:sha256(bytes)}],integrity:'service-recorded-sha256'};
}
export function verifyExport(bundle, {tenantId,agentId,framework='accord-counter',version='1.0.0'}={}) {
  exact(bundle,['manifest','state']); const m=bundle.manifest;
  exact(m,['schema_version','tenant_id','agent_id','snapshot_id','created_at','framework','required_runtime','last_consistent_step','objects','integrity']);
  exact(m.framework,['name','version']);
  if(m.framework.name!==framework || m.framework.version!==version || framework!=='accord-counter' || version!=='1.0.0' || m.required_runtime!=='node>=22.16') fail('INCOMPATIBLE');
  if(m.tenant_id!==tenantId || m.agent_id!==agentId || m.schema_version!=='1.0' ||
    typeof m.snapshot_id!=='string' || !/^rh_[a-f0-9]{32}$/.test(m.snapshot_id) || typeof m.created_at!=='string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(m.created_at) || !Number.isFinite(Date.parse(m.created_at)) || new Date(m.created_at).toISOString()!==m.created_at ||
    m.integrity!=='service-recorded-sha256' || !Array.isArray(m.objects) || m.objects.length!==1) fail('CORRUPT');
  exact(m.objects[0],['name','bytes','sha256']);
  const state=validateState(bundle.state), bytes=json(state), entry=m.objects[0];
  if(entry.name!=='state.json' || entry.bytes!==bytes.length || entry.sha256!==sha256(bytes) || m.last_consistent_step!==state.step) fail('CORRUPT');
  return state;
}
function encrypt(bytes,key,aad) {
  const iv=randomBytes(12), cipher=createCipheriv('aes-256-gcm',key,iv); cipher.setAAD(Buffer.from(aad));
  const body=Buffer.concat([cipher.update(bytes),cipher.final()]);
  return Buffer.concat([Buffer.from('RH01'),iv,cipher.getAuthTag(),body]);
}
function decrypt(bytes,key,aad) {
  try {
    if(bytes.length<ENCRYPTION_OVERHEAD || bytes.subarray(0,4).toString()!=='RH01') fail('CORRUPT');
    const cipher=createDecipheriv('aes-256-gcm',key,bytes.subarray(4,16));
    cipher.setAAD(Buffer.from(aad)); cipher.setAuthTag(bytes.subarray(16,32));
    return Buffer.concat([cipher.update(bytes.subarray(32)),cipher.final()]);
  } catch { fail('CORRUPT'); }
}

export class LocalResidentHome {
  constructor({db,store,key,mode='disabled',enabled=false,now=()=>Date.now(),databaseLimitBytes=50_000_000,bodyTimeoutMs=5000}) {
    if(mode!=='local' || enabled!==true) fail('DISABLED');
    if(!Buffer.isBuffer(key)||key.length!==32) fail('DISABLED');
    if(!Number.isSafeInteger(databaseLimitBytes)||databaseLimitBytes<1 || !Number.isInteger(bodyTimeoutMs)||bodyTimeoutMs<1||bodyTimeoutMs>10000) fail('INVALID');
    this.db=db; this.store=store; this.key=key; this.now=now;
    this.databaseLimitBytes=databaseLimitBytes; this.bodyTimeoutMs=bodyTimeoutMs;
  }
  // Synchronous local transactions deliberately hold the lock across filesystem writes.
  // Do NOT port this protocol to D1/R2 as an asynchronous transaction.
  transaction(fn) {
    this.db.exec('BEGIN IMMEDIATE');
    try { const result=fn(); this.db.exec('COMMIT'); return result; }
    catch(error) { this.db.exec('ROLLBACK'); throw error; }
  }
  scopes(agent) { return ['project:resident-home',`tenant:${agent.tenant_id}`,`agent:${agent.agent_id}`]; }
  checkCapacity() {
    const pages=this.db.prepare('PRAGMA page_count').get().page_count;
    const size=this.db.prepare('PRAGMA page_size').get().page_size;
    if(pages*size>=Math.floor(this.databaseLimitBytes*0.7)) fail('CAPACITY');
  }
  adjust(agent,resource,used,reserved) {
    if(!RESOURCE.has(resource)||!Number.isSafeInteger(used)||!Number.isSafeInteger(reserved)) fail('INVALID');
    for(const scope of this.scopes(agent)) {
      const row=this.db.prepare('SELECT * FROM rh_limits WHERE scope=? AND resource=?').get(scope,resource);
      // Period changes require operator reconciliation; never silently reset storage or reservations.
      if(!row || (row.reset_at>0 && row.reset_at<=this.now())) fail('ACCOUNTING_UNAVAILABLE');
      if(row.used+used<0 || row.reserved+reserved<0) fail('ACCOUNTING_UNAVAILABLE');
      if(row.used+row.reserved+used+reserved>row.ceiling) fail('QUOTA',row.reset_at||null);
      const result=this.db.prepare('UPDATE rh_limits SET used=used+?,reserved=reserved+? WHERE scope=? AND resource=? AND used+reserved+?+?<=ceiling AND used+?>=0 AND reserved+?>=0')
        .run(used,reserved,scope,resource,used,reserved,used,reserved);
      if(result.changes!==1) fail('ACCOUNTING_UNAVAILABLE');
    }
  }
  meter(agent,resource,amount=1) { if(!Number.isSafeInteger(amount)||amount<0) fail('INVALID'); return this.transaction(()=>this.adjust(agent,resource,amount,0)); }
  current(agent) {
    const row=this.db.prepare('SELECT * FROM rh_agents WHERE tenant_id=? AND agent_id=?').get(agent.tenant_id,agent.agent_id);
    if(!row) fail('NOT_FOUND'); return row;
  }
  writable(agent) {
    const a=this.current(agent);
    if(a.membership!=='resident'||!['trial','active'].includes(a.billing)||a.credential!=='active'||a.runtime==='stopped_by_operator') fail('FORBIDDEN');
    return a;
  }
  readable(agent) {
    const a=this.current(agent);
    if(a.membership!=='resident' && a.export_until<=this.now()) fail('FORBIDDEN');
    return a;
  }
  authenticate(request) {
    const header=request.headers.get('authorization')||'';
    if(!/^Bearer [A-Za-z0-9_-]{43}$/.test(header)) fail('UNAUTHORIZED');
    const tokenHash=sha256(header.slice(7));
    const row=this.db.prepare('SELECT a.*,s.token_hash AS session_hash FROM rh_sessions s JOIN rh_agents a ON a.tenant_id=s.tenant_id AND a.agent_id=s.agent_id WHERE s.token_hash=? AND s.revoked=0 AND s.expires_at>?').get(tokenHash,this.now());
    if(!row) fail('UNAUTHORIZED'); return row;
  }
  reauthorize(agent) {
    const session=this.db.prepare('SELECT 1 FROM rh_sessions WHERE token_hash=? AND tenant_id=? AND agent_id=? AND revoked=0 AND expires_at>?')
      .get(agent.session_hash,agent.tenant_id,agent.agent_id,this.now());
    if(!session) fail('UNAUTHORIZED');
  }
  async readBody(request,agent,max=MAX_BODY) {
    if(!(request.headers.get('content-type')||'').toLowerCase().startsWith('application/json')) fail('INVALID');
    const size=request.headers.get('content-length');
    if(size!==null && (!/^\d+$/.test(size)||Number(size)>max)) fail('TOO_LARGE');
    if(!request.body) fail('INVALID');
    const reader=request.body.getReader(), parts=[]; let bytes=0, timer;
    const timeout=new Promise((_,reject)=>{timer=setTimeout(()=>reject(new HomeError('TIMEOUT')),this.bodyTimeoutMs);});
    try {
      for(;;) {
        const {value,done}=await Promise.race([reader.read(),timeout]); if(done) break;
        this.meter(agent,'ingress_bytes',value.byteLength); bytes+=value.byteLength;
        if(bytes>max) fail('TOO_LARGE'); parts.push(Buffer.from(value));
      }
      return JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(Buffer.concat(parts)));
    } catch(error) { void reader.cancel().catch(()=>{}); if(error instanceof HomeError) throw error; fail('INVALID'); }
    finally { clearTimeout(timer); }
  }
  reserve(agent,kind,dedupeKey,payload) {
    if(!['snapshot','message'].includes(kind)||typeof dedupeKey!=='string'||!ID.test(dedupeKey)||dedupeKey.length<8) fail('INVALID');
    const digest=sha256(payload), bytes=payload.length+ENCRYPTION_OVERHEAD;
    if(payload.length>(kind==='message'?MAX_MESSAGE:MAX_BODY)) fail('TOO_LARGE');
    return this.transaction(()=>{
      this.reauthorize(agent); this.writable(agent); this.checkCapacity();
      const prior=this.db.prepare('SELECT * FROM rh_reservations WHERE tenant_id=? AND agent_id=? AND kind=? AND dedupe_key=?').get(agent.tenant_id,agent.agent_id,kind,dedupeKey);
      if(prior) { if(prior.digest!==digest) fail('CONFLICT'); if(prior.status!=='committed') fail('PENDING');
        if(this.db.prepare('SELECT 1 FROM rh_tombstones WHERE object_id=?').get(prior.id)) fail('NOT_FOUND'); return {...prior,replay:true}; }
      const active=this.db.prepare("SELECT COUNT(*) AS n FROM rh_reservations WHERE tenant_id=? AND agent_id=? AND status='pending'").get(agent.tenant_id,agent.agent_id).n;
      if(active>=2) fail('QUOTA');
      this.adjust(agent,'primary_bytes',0,bytes); this.adjust(agent,'objects',0,1);
      this.adjust(agent,'writes',1,0); this.adjust(agent,'projected_cost_micro_aud',0,0);
      if(kind==='message') this.adjust(agent,'messages',1,0);
      const id=`rh_${randomUUID().replaceAll('-','')}`, objectKey=`${agent.tenant_id}/${agent.agent_id}/${id}`;
      this.db.prepare("INSERT INTO rh_reservations VALUES(?,?,?,?,?,?,?,?,'pending',?)")
        .run(id,agent.tenant_id,agent.agent_id,kind,dedupeKey,digest,objectKey,bytes,this.now()+60000);
      return {id,tenant_id:agent.tenant_id,agent_id:agent.agent_id,kind,digest,object_key:objectKey,bytes,replay:false};
    });
  }
  commit(agent,reservation,payload,manifest) {
    if(reservation.replay) return reservation.id;
    try {
      return this.transaction(()=>{
        this.reauthorize(agent); const a=this.writable(agent);
        const r=this.db.prepare('SELECT * FROM rh_reservations WHERE id=? AND tenant_id=? AND agent_id=?').get(reservation.id,a.tenant_id,a.agent_id);
        if(!r||r.status!=='pending') fail('PENDING'); if(r.expires_at<=this.now()) fail('EXPIRED');
        if(sha256(payload)!==r.digest) fail('CONFLICT');
        const cipher=encrypt(payload,this.key,r.object_key); if(cipher.length!==r.bytes) fail('CORRUPT');
        this.store.put(r.object_key,cipher);
        const metadata=JSON.stringify(manifest);
        this.db.prepare('INSERT INTO rh_objects VALUES(?,?,?,?,?,?,?,?,?)').run(r.id,a.tenant_id,a.agent_id,r.kind,r.object_key,r.bytes,metadata,sha256(metadata),this.now());
        this.adjust(a,'primary_bytes',r.bytes,-r.bytes); this.adjust(a,'objects',1,-1);
        this.db.prepare("UPDATE rh_reservations SET status='committed' WHERE id=?").run(r.id);
        if(r.kind==='snapshot') this.db.prepare('UPDATE rh_agents SET current_snapshot=? WHERE tenant_id=? AND agent_id=?').run(r.id,a.tenant_id,a.agent_id);
        else this.db.prepare('INSERT INTO rh_outbox(message_id,tenant_id,agent_id) VALUES(?,?,?)').run(r.id,a.tenant_id,a.agent_id);
        return r.id;
      });
    } catch(error) {
      // Keep reservations when cleanup is not confirmed. Never advertise unknown bytes as free.
      try { this.abort(reservation.id,agent); } catch { /* explicit reconcile required */ }
      throw error;
    }
  }
  abort(id,agent=null) {
    return this.transaction(()=>{
      const r=this.db.prepare("SELECT * FROM rh_reservations WHERE id=? AND status='pending'").get(id); if(!r) return false;
      if(agent && (agent.tenant_id!==r.tenant_id || agent.agent_id!==r.agent_id)) fail('FORBIDDEN');
      this.store.delete(r.object_key); // must throw unless absence is confirmed
      this.adjust(r,'primary_bytes',0,-r.bytes); this.adjust(r,'objects',0,-1);
      this.db.prepare("UPDATE rh_reservations SET status='aborted' WHERE id=?").run(id); return true;
    });
  }
  reconcileExpired(max=50) {
    if(!Number.isSafeInteger(max)||max<1||max>50) fail('INVALID');
    const rows=this.db.prepare("SELECT id FROM rh_reservations WHERE status='pending' AND expires_at<=? ORDER BY expires_at,id LIMIT ?").all(this.now(),max);
    return rows.reduce((n,r)=>n+Number(this.abort(r.id)),0);
  }
  saveSnapshot(agent,state,key) {
    const safe=validateState(state), payload=json(safe), r=this.reserve(agent,'snapshot',key,payload);
    return this.commit(agent,r,payload,manifestFor(agent,r.id,safe,payload,this.now()));
  }
  saveMessage(agent,message,key) {
    exact(message,['topic','text']);
    if(typeof message.topic!=='string'||!ID.test(message.topic)||typeof message.text!=='string') fail('INVALID');
    // Best-effort content restriction, NOT proof that arbitrary text contains no secrets or PII.
    if(/-----BEGIN.*PRIVATE KEY|\b(?:sk|rk)_(?:live|test)_|\bwhsec_|api[_ -]?key\s*[:=]|seed phrase/i.test(message.text)) fail('INVALID');
    const payload=json(message), r=this.reserve(agent,'message',key,payload);
    return this.commit(agent,r,payload,{schema_version:'1.0',sha256:sha256(payload),bytes:payload.length});
  }
  getObject(agent,id,kind,maintenance=false) {
    this.reauthorize(agent); this.readable(agent); this.meter(agent,maintenance?'maintenance_reads':'reads');
    const row=this.db.prepare('SELECT * FROM rh_objects WHERE id=? AND tenant_id=? AND agent_id=? AND kind=?').get(id,agent.tenant_id,agent.agent_id,kind);
    if(!row||this.db.prepare('SELECT 1 FROM rh_tombstones WHERE object_id=?').get(id)) fail('NOT_FOUND');
    return this.decodeObject(row,agent,kind);
  }
  decodeObject(row,agent,kind) {
    try {
      if(sha256(row.manifest_json)!==row.manifest_sha) fail('CORRUPT');
      const manifest=JSON.parse(row.manifest_json), cipher=this.store.get(row.object_key);
      if(!cipher||cipher.length!==row.bytes) fail('CORRUPT');
      const bytes=decrypt(cipher,this.key,row.object_key), value=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(bytes));
      if(kind==='snapshot') { verifyExport({manifest,state:value},{tenantId:agent.tenant_id,agentId:agent.agent_id}); return {manifest,state:value}; }
      if(manifest.sha256!==sha256(bytes)||manifest.bytes!==bytes.length) fail('CORRUPT');
      return {message_id:row.id,...value};
    } catch(error) { if(error instanceof HomeError) throw error; fail('CORRUPT'); }
  }
  deleteSnapshot(agent,id) {
    this.reauthorize(agent); this.meter(agent,'reads');
    return this.transaction(()=>{
      this.reauthorize(agent); const a=this.writable(agent);
      const row=this.db.prepare("SELECT * FROM rh_objects WHERE id=? AND tenant_id=? AND agent_id=? AND kind='snapshot'").get(id,a.tenant_id,a.agent_id);
      if(!row) fail('NOT_FOUND'); if(a.current_snapshot===id) fail('LAST_SNAPSHOT');
      if(this.db.prepare('SELECT 1 FROM rh_tombstones WHERE object_id=?').get(id)) return;
      const current=this.db.prepare("SELECT * FROM rh_objects WHERE id=? AND tenant_id=? AND agent_id=? AND kind='snapshot'").get(a.current_snapshot,a.tenant_id,a.agent_id);
      if(!current) fail('CORRUPT');
      this.decodeObject(current,a,'snapshot'); // Preserve the older good copy if the current one is corrupt.
      this.store.delete(row.object_key);
      this.db.prepare('INSERT INTO rh_tombstones VALUES(?,?,?,?)').run(id,a.tenant_id,a.agent_id,this.now());
      this.adjust(a,'primary_bytes',-row.bytes,0); this.adjust(a,'objects',-1,0);
    });
  }
  outboxAttempt(agent,id,{ack=false}={}) {
    return this.transaction(()=>{
      this.reauthorize(agent); this.writable(agent);
      const row=this.db.prepare('SELECT * FROM rh_outbox WHERE message_id=? AND tenant_id=? AND agent_id=?').get(id,agent.tenant_id,agent.agent_id);
      if(!row) fail('NOT_FOUND'); if(row.status!=='pending') return {status:row.status,attempts:row.attempts};
      const attempts=row.attempts+1, status=ack?'acked':attempts===3?'dead':'pending';
      this.db.prepare('UPDATE rh_outbox SET attempts=?,status=? WHERE message_id=? AND tenant_id=? AND agent_id=?').run(attempts,status,id,agent.tenant_id,agent.agent_id);
      return {status,attempts};
    });
  }
  async fetch(request) {
    try {
      const url=new URL(request.url), origin='http://127.0.0.1:8788';
      if(url.origin!==origin || (request.headers.has('origin')&&request.headers.get('origin')!==origin)) fail('FORBIDDEN');
      const a=this.authenticate(request);
      const base='/api/v1/resident-home', path=url.pathname;
      const maintenance=(request.method==='POST'&&path===`${base}/cancel`) || (request.method==='GET'&&/^\/api\/v1\/resident-home\/snapshots\/rh_[a-f0-9]{32}\/export$/.test(path));
      this.meter(a,maintenance?'maintenance_requests':'requests');
      if(request.method==='GET' && path===`${base}/profile`) return response({profile:this.current(a),flags:FLAGS,local_only:true});
      if(request.method==='POST' && path===`${base}/cancel`) {
        const body=await this.readBody(request,a,1024); exact(body,[]);
        this.transaction(()=>{ this.reauthorize(a); this.db.prepare("UPDATE rh_agents SET membership='passport_only',billing='cancelled',export_until=CASE WHEN billing='cancelled' THEN export_until ELSE ? END WHERE tenant_id=? AND agent_id=?").run(this.now()+30*86400000,a.tenant_id,a.agent_id); });
        return response({profile:this.current(a),billing_provider_called:false,grace_is_local_fixture:true});
      }
      if(request.method==='POST' && (path===`${base}/snapshots` || path===`${base}/inbox`)) {
        this.writable(a); const isSnapshot=path.endsWith('/snapshots');
        const body=await this.readBody(request,a,isSnapshot?MAX_BODY:MAX_MESSAGE), key=request.headers.get('idempotency-key');
        const id=isSnapshot?this.saveSnapshot(a,body,key):this.saveMessage(a,body,key);
        return response({id,local_only:true},201);
      }
      const object=path.match(/^\/api\/v1\/resident-home\/(snapshots|inbox)\/(rh_[a-f0-9]{32})(\/export)?$/);
      if(object && request.method==='GET') {
        if(object[1]==='inbox'&&object[3]) fail('NOT_FOUND');
        return response(this.getObject(a,object[2],object[1]==='snapshots'?'snapshot':'message',maintenance));
      }
      if(object && request.method==='DELETE' && object[1]==='snapshots' && !object[3]) { this.deleteSnapshot(a,object[2]); return response({deleted:true}); }
      if(request.method==='GET'&&path===`${base}/inbox`) {
        this.readable(a); this.meter(a,'reads');
        const after=Number(url.searchParams.get('after')||0), limit=Number(url.searchParams.get('limit')||25);
        if(!Number.isSafeInteger(after)||after<0||!Number.isInteger(limit)||limit<1||limit>50) fail('INVALID');
        const items=this.db.prepare("SELECT o.rowid AS sequence,o.id,o.created_at,x.status,x.attempts FROM rh_objects o JOIN rh_outbox x ON x.message_id=o.id WHERE o.tenant_id=? AND o.agent_id=? AND o.kind='message' AND o.rowid>? ORDER BY o.rowid LIMIT ?").all(a.tenant_id,a.agent_id,after,limit);
        return response({items,next_after:items.length===limit?items.at(-1).sequence:null});
      }
      if(path.startsWith(base)) fail('METHOD'); fail('NOT_FOUND');
    } catch(error) { return errorResponse(error); }
  }
}
function response(body,status=200) { return new Response(JSON.stringify(body),{status,headers:{'content-type':'application/json; charset=utf-8','cache-control':'no-store','x-content-type-options':'nosniff','referrer-policy':'no-referrer'}}); }
export function errorResponse(error) {
  const code=error instanceof HomeError&&CODE[error.code]?error.code:'INTERNAL';
  return response({error:{code,message:CODE[code][1],reset_at:error instanceof HomeError?error.resetAt:null}},CODE[code][0]);
}
