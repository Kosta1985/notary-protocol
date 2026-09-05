import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
import { DatabaseSync } from 'node:sqlite';
import { randomBytes } from 'node:crypto';
import { createServer } from 'node:http';
import { Readable } from 'node:stream';
import { LocalResidentHome, DEFAULT_LIMITS, sha256, verifyExport, errorResponse } from './core.mjs';

export class FileObjects {
  constructor(root) { this.root=path.resolve(root); fs.mkdirSync(this.root,{recursive:true,mode:0o700}); }
  filename(key) {
    if(typeof key!=='string'||!/^([A-Za-z0-9_-]{1,80}\/){2}rh_[a-f0-9]{32}$/.test(key)) throw new Error('Invalid local object key');
    const target=path.join(this.root,key);
    let current=this.root;
    for(const part of key.split('/')) {
      current=path.join(current,part);
      if(fs.existsSync(current)&&fs.lstatSync(current).isSymbolicLink()) throw new Error('Symbolic link forbidden');
    }
    return target;
  }
  put(key,bytes) {
    const filename=this.filename(key); fs.mkdirSync(path.dirname(filename),{recursive:true,mode:0o700});
    const fd=fs.openSync(filename,'wx',0o600);
    try { fs.writeFileSync(fd,bytes); fs.fsyncSync(fd); } finally { fs.closeSync(fd); }
  }
  get(key) { try { return fs.readFileSync(this.filename(key)); } catch(e) { if(e.code==='ENOENT') return null; throw e; } }
  delete(key) { const filename=this.filename(key); fs.rmSync(filename,{force:true}); if(fs.existsSync(filename)) throw new Error('Deletion not confirmed'); }
}
export function openLocal(root,{key,now,databaseLimitBytes,bodyTimeoutMs}={}) {
  fs.mkdirSync(root,{recursive:true,mode:0o700});
  if(!key && fs.existsSync(path.join(root,'metadata.sqlite'))) throw new Error('Original encryption key is required for existing data.');
  const db=new DatabaseSync(path.join(root,'metadata.sqlite'));
  db.exec('PRAGMA journal_mode=WAL; PRAGMA synchronous=FULL; PRAGMA busy_timeout=5000;');
  db.exec(fs.readFileSync(new URL('./schema.sql',import.meta.url),'utf8'));
  const store=new FileObjects(path.join(root,'objects'));
  const home=new LocalResidentHome({db,store,key:key||randomBytes(32),mode:'local',enabled:true,now,databaseLimitBytes,bodyTimeoutMs});
  return {db,store,home,close(){db.close();}};
}
// Local fixture only. No HTTP enrollment route, payment event, legal acceptance or verified operator claim.
export function provisionLocal(h,{tenantId='fixture_tenant',agentId='ACCORD-LOCAL-ALPHA',resident=true,token=randomBytes(32).toString('base64url')}={}) {
  if(!/^[A-Za-z0-9_-]{1,80}$/.test(tenantId)||!/^[A-Za-z0-9_-]{1,80}$/.test(agentId)) throw new Error('Invalid fixture identity');
  const a={tenant_id:tenantId,agent_id:agentId};
  h.home.transaction(()=>{
    if(h.db.prepare('SELECT COUNT(*) AS n FROM rh_agents').get().n>=100) throw new Error('Local seat cap');
    if(!h.db.prepare('SELECT 1 FROM rh_agents WHERE tenant_id=?').get(tenantId)&&h.db.prepare('SELECT COUNT(DISTINCT tenant_id) AS n FROM rh_agents').get().n>=10) throw new Error('Local tenant cap');
    h.db.prepare('INSERT INTO rh_agents(agent_id,tenant_id,membership) VALUES(?,?,?)').run(agentId,tenantId,resident?'resident':'passport_only');
    h.db.prepare('INSERT INTO rh_sessions(token_hash,tenant_id,agent_id,expires_at) VALUES(?,?,?,?)').run(sha256(token),tenantId,agentId,h.home.now()+7*86400000);
    for(const scope of h.home.scopes(a)) for(const [resource,ceiling] of Object.entries(DEFAULT_LIMITS))
      h.db.prepare('INSERT OR IGNORE INTO rh_limits(scope,resource,ceiling) VALUES(?,?,?)').run(scope,resource,ceiling);
  });
  const request=(route,{method='GET',body,raw,headers={}}={})=>new Request(`http://127.0.0.1:8788/api/v1/resident-home${route}`,{
    method,headers:{authorization:`Bearer ${token}`,...(body!==undefined||raw!==undefined?{'content-type':'application/json'}:{}),...headers},
    ...(body!==undefined||raw!==undefined?{body:raw??JSON.stringify(body),duplex:'half'}:{})});
  return {tenantId,agentId,token,request,agent:h.home.authenticate(request('/profile'))};
}
export async function demo() {
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'accord-home-')), h=openLocal(root);
  try {
    const a=provisionLocal(h), state={schema_version:'1.0',counter:17,step:4,completed_operations:[]};
    const saved=await h.home.fetch(a.request('/snapshots',{method:'POST',body:state,headers:{'idempotency-key':'demo-snapshot-1'}}));
    if(saved.status!==201) throw new Error('Snapshot failed'); const {id}=await saved.json();
    const exported=await h.home.fetch(a.request(`/snapshots/${id}/export`));
    if(exported.status!==200) throw new Error('Export failed');
    const bundle=await exported.json(), secondInstance=verifyExport(bundle,{tenantId:a.tenantId,agentId:a.agentId});
    const message=await h.home.fetch(a.request('/inbox',{method:'POST',body:{topic:'checkpoint',text:'Synthetic checkpoint is available.'},headers:{'idempotency-key':'demo-message-1'}}));
    if(message.status!==201) throw new Error('Inbox failed');
    const cancelled=await h.home.fetch(a.request('/cancel',{method:'POST',body:{}}));
    if(cancelled.status!==200) throw new Error('Cancel failed');
    const after=await h.home.fetch(a.request(`/snapshots/${id}/export`));
    if(after.status!==200) throw new Error('Export grace failed');
    return {status:'passed',local_only:true,counter_restored:secondInstance.counter,agent_id_unchanged:(await cancelled.json()).profile.agent_id===a.agentId,
      snapshot_exported:true,inbox_persisted:true,export_after_cancel:true,external_runtime_processes_tested:false,
      independent_backup_tested:false,new_cloud_expense_aud:0,live_billing:false};
  } finally { h.close(); fs.rmSync(root,{recursive:true,force:true}); }
}
async function serve() {
  const root=fileURLToPath(new URL('./.local/',import.meta.url)); fs.mkdirSync(root,{recursive:true,mode:0o700});
  const keyPath=path.join(root,'encryption-key-v1.bin'), credentialsPath=path.join(root,'dev-access.json');
  if(!fs.existsSync(keyPath)) {
    if(fs.existsSync(path.join(root,'metadata.sqlite'))) throw new Error('Existing data requires its original encryption key.');
    fs.writeFileSync(keyPath,randomBytes(32),{mode:0o600,flag:'wx'});
  }
  const h=openLocal(root,{key:fs.readFileSync(keyPath)});
  if(!fs.existsSync(credentialsPath)) {
    const a=provisionLocal(h);
    fs.writeFileSync(credentialsPath,JSON.stringify({tenant_id:a.tenantId,agent_id:a.agentId,token:a.token}),{mode:0o600,flag:'wx'});
  }
  const server=createServer(async(req,res)=>{
    try {
      if(req.headers.host!=='127.0.0.1:8788') { res.writeHead(403); res.end(); return; }
      const request=new Request(`http://127.0.0.1:8788${req.url}`,{method:req.method,headers:req.headers,
        ...(!['GET','HEAD'].includes(req.method)?{body:Readable.toWeb(req),duplex:'half'}:{})});
      const response=await h.home.fetch(request); res.writeHead(response.status,Object.fromEntries(response.headers)); res.end(Buffer.from(await response.arrayBuffer()));
    } catch(error) { const r=errorResponse(error); res.writeHead(r.status,Object.fromEntries(r.headers)); res.end(await r.text()); }
  });
  server.requestTimeout=10000; server.headersTimeout=10000; server.maxHeadersCount=32;
  server.listen(8788,'127.0.0.1',()=>console.log(JSON.stringify({local_api:'http://127.0.0.1:8788/api/v1/resident-home',credentials_file:credentialsPath,secrets_logged:false})));
  const stop=()=>server.close(()=>{h.close();process.exit(0);}); process.once('SIGINT',stop); process.once('SIGTERM',stop);
}
if(process.argv[1] && path.resolve(process.argv[1])===fileURLToPath(import.meta.url)) {
  if(process.argv[2]==='demo') console.log(JSON.stringify(await demo(),null,2));
  else if(process.argv[2]==='serve') await serve();
  else { console.error('Usage: node experimental/resident-home/local.mjs demo|serve'); process.exitCode=2; }
}
