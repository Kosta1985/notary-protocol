import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import fs from 'node:fs';
import worker from '../cloudflare/src/worker-v2.js';
const request=body=>new Request('https://accordtrace.test/api/v1/launch/waitlist',{method:'POST',headers:{'content-type':'application/json'},body:typeof body==='string'?body:JSON.stringify(body)});
const unusedDB={prepare(){throw Error('DB must not be called for invalid input')}};
test('waitlist rejects non-object and incorrectly typed fields with 400 not 500',async()=>{
  for(const body of [null,[],4,{email:{toString:null}},{email:'a@b.test',source:[]},{email:'a@b.test',website:{}},{email:'a@b.test',interest:5}]){
    const res=await worker.fetch(request(body),{DB:unusedDB},{});assert.equal(res.status,400);
  }
});
test('waitlist rejects oversized or invalid UTF-8 JSON before touching the database',async()=>{
  const res=await worker.fetch(request({email:'a@b.test',source:'a'.repeat(20000)}),{DB:unusedDB},{});assert.equal(res.status,413);
  const invalid=new Request('https://accordtrace.test/api/v1/launch/waitlist',{method:'POST',body:new Uint8Array([123,34,97,34,58,34,255,34,125])});
  assert.equal((await worker.fetch(invalid,{DB:unusedDB},{})).status,400);
});
test('waitlist honors prior unsubscribe and does not falsely confirm enrollment',async t=>{
  const db=new DatabaseSync(':memory:');t.after(()=>db.close());
  db.exec(fs.readFileSync(new URL('../cloudflare/migrations/0016_launch_waitlist.sql',import.meta.url),'utf8'));
  const env = {DB: {
    prepare(sql) {
      return {bind(...args) {
        return {async run() {
          const params = Object.fromEntries(args.map((v,i) => [String(i+1), v]));
          return {meta: db.prepare(sql).run(params)};
        }};
      }};
    }
  }};
  const body={email:'  Example@Demo.test  ',interest:'developer',source:'homepage'};
  const first=await worker.fetch(request(body),env,{}),accepted=await first.json();assert.equal(first.status,201);
  db.prepare("UPDATE launch_waitlist SET status='unsubscribed'").run();
  const again=await worker.fetch(request(body),env,{});assert.deepEqual(await again.json(),accepted);
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM launch_waitlist').get().n,1);
  assert.equal(db.prepare('SELECT status FROM launch_waitlist').get().status,'unsubscribed');
  assert.equal(accepted.status,'received');assert.doesNotMatch(accepted.message,/You are on/);
});
