import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { randomBytes } from 'node:crypto';
import { LocalResidentHome, FLAGS, MAX_BODY, validateState, verifyExport, sha256, HomeError, errorResponse } from './core.mjs';
import { openLocal, provisionLocal, demo } from './local.mjs';
import { scenario, r2Incremental, R2_TARIFF } from './economics.mjs';

const state=(n=1)=>({schema_version:'1.0',counter:n,step:n,completed_operations:[]});
function setup(t,options={}) {
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'resident-test-')), key=randomBytes(32), h=openLocal(root,{key,...options});
  let closed=false; const close=()=>{if(!closed){h.close();closed=true;}};
  t.after(()=>{close();fs.rmSync(root,{recursive:true,force:true});});
  return {...h,root,key,close,a:provisionLocal(h)};
}
async function call(h,a,route,opts) { const r=await h.home.fetch(a.request(route,opts));return {status:r.status,body:await r.json(),headers:r.headers}; }
async function save(h,a=h.a,n=1,key=`snapshot-${n}`) {
  const r=await call(h,a,'/snapshots',{method:'POST',body:state(n),headers:{'idempotency-key':key}});
  assert.equal(r.status,201,JSON.stringify(r.body)); return r.body.id;
}
function cap(h,agent,resource,ceiling) { h.db.prepare('UPDATE rh_limits SET ceiling=? WHERE scope=? AND resource=?').run(ceiling,`agent:${agent.agentId}`,resource); }
const hasCode=code=>error=>error instanceof HomeError && error.code===code;

test('Resident Home release flags are frozen and off; local constructor needs explicit opt-in',()=>{
  assert.ok(Object.values(FLAGS).every(v=>v===false)); assert.ok(Object.isFrozen(FLAGS));
  assert.throws(()=>new LocalResidentHome({}),hasCode('DISABLED'));
  assert.throws(()=>new LocalResidentHome({mode:'production',enabled:true,key:randomBytes(32)}),hasCode('DISABLED'));
});
test('membership, billing, runtime and credential stay independent; cancellation retains the identifier',async t=>{
  const h=setup(t), before=await call(h,h.a,'/profile');
  assert.equal(before.body.profile.membership,'resident');assert.equal(before.body.profile.billing,'trial');assert.equal(before.body.profile.public_opt_in,0);
  h.db.prepare("UPDATE rh_agents SET runtime='stopped_by_operator',credential='revoked' WHERE agent_id=?").run(h.a.agentId);
  const after=await call(h,h.a,'/cancel',{method:'POST',body:{}});
  assert.equal(after.status,200);assert.equal(after.body.profile.agent_id,h.a.agentId);assert.equal(after.body.profile.membership,'passport_only');
  assert.equal(after.body.profile.runtime,'stopped_by_operator');assert.equal(after.body.profile.credential,'revoked');assert.equal(after.body.billing_provider_called,false);
});
test('passport-only fixture cannot save state until an operator changes the local fixture',async t=>{
  const h=setup(t), a=provisionLocal(h,{agentId:'PASSPORT-ONLY',resident:false});
  const r=await call(h,a,'/snapshots',{method:'POST',body:state(),headers:{'idempotency-key':'cannot-upgrade'}});
  assert.equal(r.status,403);assert.equal(h.db.prepare('SELECT COUNT(*) AS n FROM rh_objects').get().n,0);
});
test('plaintext session tokens are not stored in metadata and revoked sessions are rejected',async t=>{
  const h=setup(t), session=h.db.prepare('SELECT * FROM rh_sessions').get();
  assert.equal(session.token_hash,sha256(h.a.token));assert.ok(!JSON.stringify(session).includes(h.a.token));
  h.db.prepare('UPDATE rh_sessions SET revoked=1').run();assert.equal((await call(h,h.a,'/profile')).status,401);
});
test('cross-tenant read, export and delete cannot access another agent snapshot',async t=>{
  const h=setup(t), b=provisionLocal(h,{tenantId:'OTHER',agentId:'OTHER-AGENT'}), id=await save(h);
  for(const suffix of ['', '/export'])assert.equal((await call(h,b,`/snapshots/${id}${suffix}`)).status,404);
  assert.equal((await call(h,b,`/snapshots/${id}`,{method:'DELETE'})).status,404);
  assert.equal((await call(h,h.a,`/snapshots/${id}/export`)).status,200);
});
test('same-tenant sessions remain agent scoped',async t=>{
  const h=setup(t), b=provisionLocal(h,{tenantId:h.a.tenantId,agentId:'SIBLING'}),id=await save(h);
  assert.equal((await call(h,b,`/snapshots/${id}`)).status,404);
});
test('invalid signatures are not relevant here: unsigned and malformed bearer access fails closed',async t=>{
  const h=setup(t),request=new Request('http://127.0.0.1:8788/api/v1/resident-home/profile');
  assert.equal((await h.home.fetch(request)).status,401);
  assert.equal((await call(h,h.a,'/profile',{headers:{authorization:'Bearer invalid'}})).status,401);
});
test('Host/origin mismatch is rejected before storage',async t=>{
  const h=setup(t);
  assert.equal((await call(h,h.a,'/profile',{headers:{origin:'https://untrusted.example'}})).status,403);
  const r=new Request('https://accordtrace.notary-labs.workers.dev/api/v1/resident-home/profile',{headers:{authorization:`Bearer ${h.a.token}`}});
  assert.equal((await h.home.fetch(r)).status,403);
});
test('snapshot export is versioned, byte/hash checked and contains no key or permissions fields',async t=>{
  const h=setup(t),id=await save(h),r=await call(h,h.a,`/snapshots/${id}/export`);
  assert.equal(r.status,200);assert.deepEqual(verifyExport(r.body,{tenantId:h.a.tenantId,agentId:h.a.agentId}),state());
  assert.equal(r.body.manifest.integrity,'service-recorded-sha256');assert.ok(!JSON.stringify(r.body).includes(h.key.toString('hex')));
  assert.deepEqual(Object.keys(r.body.state),['schema_version','counter','step','completed_operations']);
});
test('snapshot plaintext is encrypted on disk and ciphertext is scope-bound',async t=>{
  const h=setup(t),id=await save(h),row=h.db.prepare('SELECT * FROM rh_objects WHERE id=?').get(id),cipher=h.store.get(row.object_key);
  assert.ok(!cipher.includes(Buffer.from('completed_operations')));assert.equal(cipher.length,Buffer.byteLength(JSON.stringify(state()))+32);
  const b=provisionLocal(h,{tenantId:'OTHER',agentId:'OTHER-AGENT'}),bid=await save(h,b),brow=h.db.prepare('SELECT * FROM rh_objects WHERE id=?').get(bid);
  fs.writeFileSync(h.store.filename(brow.object_key),cipher);
  assert.equal((await call(h,b,`/snapshots/${bid}`)).body.error.code,'CORRUPT');
});
test('idempotent retries reuse a snapshot but consume request and ingress budgets',async t=>{
  const h=setup(t),id=await save(h);assert.equal(await save(h),id);
  assert.equal(h.db.prepare('SELECT COUNT(*) AS n FROM rh_objects').get().n,1);
  assert.equal(h.db.prepare("SELECT used FROM rh_limits WHERE scope=? AND resource='requests'").get(`agent:${h.a.agentId}`).used,2);
  const conflict=await call(h,h.a,'/snapshots',{method:'POST',body:state(2),headers:{'idempotency-key':'snapshot-1'}});
  assert.equal(conflict.status,409);assert.equal(conflict.body.error.code,'CONFLICT');
});
test('100 simultaneous local submissions cannot exceed reserved plus committed byte quota',async t=>{
  const h=setup(t),bytes=Buffer.byteLength(JSON.stringify(state()))+32;cap(h,h.a,'primary_bytes',bytes*3);
  const results=await Promise.all(Array.from({length:100},(_,i)=>call(h,h.a,'/snapshots',{method:'POST',body:state(),headers:{'idempotency-key':`parallel-${i.toString().padStart(4,'0')}`}})));
  assert.equal(results.filter(r=>r.status===201).length,3);assert.equal(results.filter(r=>r.status===429).length,97);
  const balance=h.db.prepare("SELECT used,reserved FROM rh_limits WHERE scope=? AND resource='primary_bytes'").get(`agent:${h.a.agentId}`);
  assert.equal(balance.used,bytes*3);assert.equal(balance.reserved,0);
});
test('project and tenant limits also participate atomically; rejected reservation rolls back earlier scopes',t=>{
  const h=setup(t),body=Buffer.from(JSON.stringify(state()));
  h.db.prepare("UPDATE rh_limits SET ceiling=1 WHERE scope=? AND resource='primary_bytes'").run(`tenant:${h.a.tenantId}`);
  assert.throws(()=>h.home.reserve(h.a.agent,'snapshot','bounded-parent',body),hasCode('QUOTA'));
  const p=h.db.prepare("SELECT reserved FROM rh_limits WHERE scope='project:resident-home' AND resource='primary_bytes'").get();assert.equal(p.reserved,0);
});
test('two active upload sessions are enforced even when byte quota remains',t=>{
  const h=setup(t),body=Buffer.from(JSON.stringify(state()));
  h.home.reserve(h.a.agent,'snapshot','pending-one',body);h.home.reserve(h.a.agent,'snapshot','pending-two',body);
  assert.throws(()=>h.home.reserve(h.a.agent,'snapshot','pending-three',body),hasCode('QUOTA'));
});
test('expired reservations are cleaned in bounded batches; late commits are fenced out',t=>{
  let now=1788600000000;const h=setup(t,{now:()=>now}),payload=Buffer.from(JSON.stringify(state()));
  const r=h.home.reserve(h.a.agent,'snapshot','expiry-reservation',payload);now+=61000;
  assert.equal(h.home.reconcileExpired(),1);assert.throws(()=>h.home.commit(h.a.agent,r,payload,{}),hasCode('PENDING'));
  assert.equal(h.store.get(r.object_key),null);assert.equal(h.db.prepare("SELECT SUM(reserved) AS n FROM rh_limits WHERE resource='primary_bytes'").get().n,0);
});
test('storage failure cannot create a snapshot; failed writes remain metered',async t=>{
  const h=setup(t);h.store.put=()=>{throw new Error('SECRET SQL provider error');};
  const r=await call(h,h.a,'/snapshots',{method:'POST',body:state(),headers:{'idempotency-key':'storage-failure'}});
  assert.equal(r.status,503);assert.ok(!JSON.stringify(r.body).includes('SECRET'));
  assert.equal(h.db.prepare('SELECT COUNT(*) AS n FROM rh_objects').get().n,0);
  assert.equal(h.db.prepare("SELECT used FROM rh_limits WHERE scope=? AND resource='writes'").get(`agent:${h.a.agentId}`).used,1);
});
test('failed cleanup retains the reservation instead of advertising storage as free',t=>{
  const h=setup(t),payload=Buffer.from(JSON.stringify(state())),r=h.home.reserve(h.a.agent,'snapshot','uncertain-cleanup',payload);
  h.store.delete=()=>{throw new Error('Unavailable');};assert.throws(()=>h.home.abort(r.id));
  assert.equal(h.db.prepare('SELECT status FROM rh_reservations WHERE id=?').get(r.id).status,'pending');
});
test('missing accounting and zero projected spend gates are fail-closed',async t=>{
  const h=setup(t);assert.throws(()=>h.home.meter(h.a.agent,'projected_cost_micro_aud',1),hasCode('QUOTA'));
  h.db.prepare("DELETE FROM rh_limits WHERE scope='project:resident-home' AND resource='writes'").run();
  const r=await call(h,h.a,'/snapshots',{method:'POST',body:state(),headers:{'idempotency-key':'missing-accounting'}});
  assert.equal(r.status,503);assert.equal(r.body.error.code,'ACCOUNTING_UNAVAILABLE');
});
test('70 percent database capacity guard rejects additional objects',async t=>{
  const h=setup(t);h.home.databaseLimitBytes=1;
  const r=await call(h,h.a,'/snapshots',{method:'POST',body:state(),headers:{'idempotency-key':'database-capacity'}});
  assert.equal(r.body.error.code,'CAPACITY');assert.equal(h.db.prepare('SELECT COUNT(*) AS n FROM rh_objects').get().n,0);
});
test('stream byte limits defeat false Content-Length and count failed ingress',async t=>{
  const h=setup(t),stream=new ReadableStream({start(c){c.enqueue(new TextEncoder().encode(' '.repeat(32001)));c.close();}});
  const r=await call(h,h.a,'/inbox',{method:'POST',raw:stream,headers:{'content-length':'1','idempotency-key':'oversize-stream'}});
  assert.equal(r.status,413);assert.equal(h.db.prepare("SELECT used FROM rh_limits WHERE scope=? AND resource='ingress_bytes'").get(`agent:${h.a.agentId}`).used,32001);
});
test('declared oversized uploads are rejected without reading the body',async t=>{
  const h=setup(t),r=await call(h,h.a,'/snapshots',{method:'POST',raw:'{}',headers:{'content-length':String(MAX_BODY+1),'idempotency-key':'declared-too-big'}});
  assert.equal(r.status,413);assert.equal(h.db.prepare("SELECT used FROM rh_limits WHERE scope=? AND resource='ingress_bytes'").get(`agent:${h.a.agentId}`).used,0);
});
test('stalled body and malformed UTF-8 fail before object insertion',async t=>{
  const h=setup(t,{bodyTimeoutMs:10});
  const stalled=await call(h,h.a,'/inbox',{method:'POST',raw:new ReadableStream({start(){}}),headers:{'idempotency-key':'stalled-body'}});
  assert.equal(stalled.status,408);
  const corrupt=await call(h,h.a,'/inbox',{method:'POST',raw:new Uint8Array([123,255,125]),headers:{'idempotency-key':'invalid-utf8'}});
  assert.equal(corrupt.status,400);assert.equal(h.db.prepare('SELECT COUNT(*) AS n FROM rh_objects').get().n,0);
});
test('state schema rejects executable data, credential fields and invalid operation journals',()=>{
  for(const extra of ['api_key','private_key','permissions','balance','pickle','eval','dependencies','__proto__']){
    const input={...state(),[extra]:'untrusted'};assert.throws(()=>validateState(input),hasCode('INVALID'));
  }
  assert.throws(()=>validateState({...state(),counter:-1}),hasCode('INVALID'));
  assert.throws(()=>validateState({...state(),completed_operations:['arbitrary secret']}),hasCode('INVALID'));
});
test('incompatible and corrupted exports are rejected before any external runtime action',async t=>{
  const h=setup(t),id=await save(h),r=await call(h,h.a,`/snapshots/${id}`),opts={tenantId:h.a.tenantId,agentId:h.a.agentId};
  const bad=structuredClone(r.body);bad.manifest.framework.version='999';assert.throws(()=>verifyExport(bad,opts),hasCode('INCOMPATIBLE'));
  const corrupt=structuredClone(r.body);corrupt.state.counter++;assert.throws(()=>verifyExport(corrupt,opts),hasCode('CORRUPT'));
  assert.throws(()=>verifyExport(r.body,{...opts,tenantId:'other'}),hasCode('CORRUPT'));
});
test('cancel is idempotent, export grace survives cancellation and cannot be extended through retries',async t=>{
  let now=1788600000000;const h=setup(t,{now:()=>now}),id=await save(h);
  const cancelled=await call(h,h.a,'/cancel',{method:'POST',body:{}}),until=cancelled.body.profile.export_until;
  now+=1000;const repeated=await call(h,h.a,'/cancel',{method:'POST',body:{}});assert.equal(repeated.body.profile.export_until,until);
  assert.equal((await call(h,h.a,`/snapshots/${id}/export`)).status,200);
  const write=await call(h,h.a,'/snapshots',{method:'POST',body:state(3),headers:{'idempotency-key':'after-cancel'}});assert.equal(write.status,403);
  now=until+1;h.db.prepare('UPDATE rh_sessions SET expires_at=?').run(now+60000);
  assert.equal((await call(h,h.a,`/snapshots/${id}/export`)).status,403);
});
test('stop or credential revocation prevents new writes and export never restores old privileges',async t=>{
  const h=setup(t),id=await save(h);h.db.prepare("UPDATE rh_agents SET runtime='stopped_by_operator',credential='revoked'").run();
  assert.equal((await call(h,h.a,'/snapshots',{method:'POST',body:state(2),headers:{'idempotency-key':'after-stop'}})).status,403);
  const exported=await call(h,h.a,`/snapshots/${id}/export`);assert.equal(exported.status,200);
  assert.equal(h.db.prepare('SELECT credential FROM rh_agents').get().credential,'revoked');
});
test('old snapshot deletion frees cipher bytes, but the current snapshot is protected',async t=>{
  const h=setup(t),old=await save(h),current=await save(h,h.a,2);
  assert.equal((await call(h,h.a,`/snapshots/${current}`,{method:'DELETE'})).body.error.code,'LAST_SNAPSHOT');
  assert.equal((await call(h,h.a,`/snapshots/${old}`,{method:'DELETE'})).status,200);
  assert.equal((await call(h,h.a,`/snapshots/${old}`)).status,404);
  assert.equal((await call(h,h.a,`/snapshots/${old}`,{method:'DELETE'})).status,200);
  const used=h.db.prepare("SELECT used FROM rh_limits WHERE scope=? AND resource='objects'").get(`agent:${h.a.agentId}`).used;assert.equal(used,1);
});
test('a reintroduced deleted payload does not bypass a retained tombstone',async t=>{
  const h=setup(t),old=await save(h),row=h.db.prepare('SELECT * FROM rh_objects WHERE id=?').get(old),bytes=h.store.get(row.object_key);
  await save(h,h.a,2);await call(h,h.a,`/snapshots/${old}`,{method:'DELETE'});h.store.put(row.object_key,bytes);
  assert.equal((await call(h,h.a,`/snapshots/${old}/export`)).status,404);
});
test('inbox persists independently of notification delivery, and repeated submissions are deduplicated',async t=>{
  const h=setup(t),opts={method:'POST',body:{topic:'status',text:'Synthetic private message.'},headers:{'idempotency-key':'message-dedup'}};
  const first=await call(h,h.a,'/inbox',opts),second=await call(h,h.a,'/inbox',opts);assert.equal(first.status,201);assert.equal(first.body.id,second.body.id);
  assert.equal(h.db.prepare('SELECT COUNT(*) AS n FROM rh_outbox').get().n,1);
  assert.equal((await call(h,h.a,`/inbox/${first.body.id}`)).body.text,'Synthetic private message.');
  assert.equal(h.db.prepare('SELECT attempts FROM rh_outbox').get().attempts,0);
});
test('inbox and snapshots survive a local process-store reopen with the original key',async t=>{
  const h=setup(t),id=await save(h),message=await call(h,h.a,'/inbox',{method:'POST',body:{topic:'restart',text:'Synthetic restart.'},headers:{'idempotency-key':'restart-message'}});
  h.close();const reopened=openLocal(h.root,{key:h.key});
  try {
    assert.equal((await call(reopened,h.a,`/snapshots/${id}`)).status,200);
    assert.equal((await call(reopened,h.a,`/inbox/${message.body.id}`)).body.text,'Synthetic restart.');
  } finally {reopened.close();}
});
test('three notification failures reach bounded dead-letter state; ack is idempotent and executes no external action',async t=>{
  const h=setup(t),r=await call(h,h.a,'/inbox',{method:'POST',body:{topic:'retry',text:'Synthetic retry.'},headers:{'idempotency-key':'message-retry'}});
  for(let i=0;i<10;i++)h.home.outboxAttempt(h.a.agent,r.body.id);
  assert.deepEqual(h.home.outboxAttempt(h.a.agent,r.body.id,{ack:true}),{status:'dead',attempts:3});
  const second=await call(h,h.a,'/inbox',{method:'POST',body:{topic:'ack',text:'Synthetic ack.'},headers:{'idempotency-key':'message-ack'}});
  assert.deepEqual(h.home.outboxAttempt(h.a.agent,second.body.id,{ack:true}),{status:'acked',attempts:1});
  assert.deepEqual(h.home.outboxAttempt(h.a.agent,second.body.id,{ack:true}),{status:'acked',attempts:1});
});
test('message quota blocks self-message loops and unsupported destinations are rejected',async t=>{
  const h=setup(t);cap(h,h.a,'messages',1);
  const first=await call(h,h.a,'/inbox',{method:'POST',body:{topic:'loop',text:'Synthetic loop.'},headers:{'idempotency-key':'loop-message-1'}});assert.equal(first.status,201);
  const second=await call(h,h.a,'/inbox',{method:'POST',body:{topic:'loop',text:'Synthetic loop.'},headers:{'idempotency-key':'loop-message-2'}});assert.equal(second.status,429);
  const ssrf=await call(h,h.a,'/inbox',{method:'POST',body:{topic:'url',text:'synthetic',destination:'http://169.254.169.254/'},headers:{'idempotency-key':'unknown-destination'}});assert.equal(ssrf.status,400);
});
test('inbox paging is bounded and newly inserted records follow the high-water cursor',async t=>{
  const h=setup(t);for(let i=0;i<2;i++)await call(h,h.a,'/inbox',{method:'POST',body:{topic:'page',text:'Synthetic.'},headers:{'idempotency-key':`page-msg-${i}`}});
  const page=await call(h,h.a,'/inbox?limit=1');assert.equal(page.body.items.length,1);
  const next=await call(h,h.a,`/inbox?after=${page.body.next_after}&limit=1`);assert.notEqual(page.body.items[0].id,next.body.items[0].id);
  assert.equal((await call(h,h.a,'/inbox?limit=100000')).status,400);
});
test('errors never reflect arbitrary SQL, keys, HTML or provider traces',async()=>{
  for(const e of [new Error('SELECT secret FROM db; sk_live_hidden'),{status:500,message:'<script>alert(1)</script>'}]){
    const r=errorResponse(e),text=await r.text();assert.equal(r.status,503);assert.ok(!/SELECT|sk_live|script/.test(text));assert.equal(r.headers.get('cache-control'),'no-store');
  }
});
test('economic control scenarios reproduce the supplied arithmetic without treating gross receipts as profit',()=>{
  const n=scenario({seats:1000});assert.equal(n.gross_collections,9000);assert.equal(n.net_sales,8181.82);assert.ok(Math.abs(n.contribution_per_seat-5.233818181818182)<1e-9);
  assert.equal(n.stripe_payments+n.stripe_billing,678);assert.equal(n.result_before_founder_development_income_tax,1733.82);
  assert.equal(scenario({seats:5000,fixed:10000}).result_before_founder_development_income_tax,8669.09);
  assert.equal(scenario({seats:0}).result_before_founder_development_income_tax,-2000);
  assert.ok(scenario({seats:1000,supportMinutes:10,infrastructure:1.5}).contribution<0);
});
test('operator cohorts are not inflated by multiple seats; new acquisition and initial CAC are separate',()=>{
  const s=scenario({seats:1000,operators:100,newOperators:10});assert.equal(s.churn_replacement_cac,150);assert.equal(s.new_customer_acquisition,300);assert.equal(s.initial_base_acquisition_one_off,3000);
  assert.throws(()=>scenario({seats:1,operators:2}));assert.throws(()=>scenario({seats:1,price:NaN}));
});
test('R2 estimate rounds account totals and does not reuse a shared free tier',()=>{
  const a=r2Incremental({existing:{storage:10,class_a:1000000,class_b:10000000},added:{storage:0.1,class_a:1,class_b:1}});
  assert.ok(Math.abs(a.incremental_usd-(0.015+4.5+0.36))<1e-9);
  const b=r2Incremental({existing:{storage:10.1,class_a:1000001,class_b:10000001},added:{storage:0.1,class_a:1,class_b:1}});assert.equal(b.incremental_usd,0);
  const fx=r2Incremental({existing:{storage:10,class_a:0,class_b:0},added:{storage:1,class_a:0,class_b:0},usdAud:1.8,taxMultiplier:1.1});assert.ok(Math.abs(fx.incremental_aud-0.015*1.8*1.1)<1e-9);
});
test('future, stale and wrong-currency tariffs cannot open a calculation or a launch',()=>{
  for(const asOf of ['2026-09-04','2026-10-07','invalid'])assert.throws(()=>r2Incremental({asOf}));
  assert.throws(()=>r2Incremental({tariff:{...R2_TARIFF,currency:'AUD'}}));assert.ok(Object.values(FLAGS).every(v=>v===false));
});
test('offline demonstration completes without a network provider',async()=>{
  const result=await demo();assert.equal(result.status,'passed');assert.equal(result.new_cloud_expense_aud,0);assert.equal(result.independent_backup_tested,false);
});

test('ordinary request exhaustion retains separately bounded cancel and export access',async t=>{
  const h=setup(t),id=await save(h);cap(h,h.a,'requests',1);
  assert.equal((await call(h,h.a,'/profile')).status,429);
  assert.equal((await call(h,h.a,'/cancel',{method:'POST',body:{}})).status,200);
  assert.equal((await call(h,h.a,`/snapshots/${id}/export`)).status,200);
});
test('a corrupted newest snapshot cannot authorize deletion of the older good checkpoint',async t=>{
  const h=setup(t),old=await save(h),current=await save(h,h.a,2),row=h.db.prepare('SELECT * FROM rh_objects WHERE id=?').get(current);
  fs.writeFileSync(h.store.filename(row.object_key),Buffer.alloc(row.bytes));
  const result=await call(h,h.a,`/snapshots/${old}`,{method:'DELETE'});assert.equal(result.body.error.code,'CORRUPT');
  assert.equal((await call(h,h.a,`/snapshots/${old}/export`)).status,200);
});
test('missing idempotency keys and non-string manifest IDs are explicit client errors',async t=>{
  const h=setup(t),r=await call(h,h.a,'/snapshots',{method:'POST',body:state()});assert.equal(r.status,400);
  const id=await save(h),bundle=(await call(h,h.a,`/snapshots/${id}/export`)).body;bundle.manifest.snapshot_id=123;
  assert.throws(()=>verifyExport(bundle,{tenantId:h.a.tenantId,agentId:h.a.agentId}),hasCode('CORRUPT'));
  bundle.manifest.snapshot_id=id;bundle.manifest.created_at='2026-02-30T00:00:00.000Z';
  assert.throws(()=>verifyExport(bundle,{tenantId:h.a.tenantId,agentId:h.a.agentId}),hasCode('CORRUPT'));
});
test('existing data cannot silently acquire a replacement encryption key',t=>{
  const h=setup(t);h.close();assert.throws(()=>openLocal(h.root));
});
