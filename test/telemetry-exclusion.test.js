import test from 'node:test';
import assert from 'node:assert/strict';
import worker from '../cloudflare/src/worker-v2.js';
import { recordUsage } from '../cloudflare/src/usage-analytics.js';
function env(){
  const writes=[];
  return {
    writes,
    ASSETS:{async fetch(){return new Response('<html>test</html>',{headers:{'content-type':'text/html'}})}},
    DB:{prepare(sql){return {bind(event){return {async run(){writes.push({sql,event})}}}}}}
  };
}
test('any declared website audit is excluded from legacy homepage analytics',async()=>{
  for(const marker of ['website-system-audit','website-browser-audit','functional-site-audit','issuer-initialization']){
    const e=env();const response=await worker.fetch(new Request('https://accordtrace.test/',{headers:{'x-notary-monitor':marker}}),e,{});assert.equal(response.status,200);assert.equal(e.writes.length,0);
  }
});
test('unmarked visitor page views are still counted exactly once',async()=>{
  const e=env();await worker.fetch(new Request('https://accordtrace.test/'),e,{});assert.equal(e.writes.length,1);assert.equal(e.writes[0].event,'page_view');
});
test('explicit telemetry exclusion is honored by modern usage reporting',async()=>{
  const e=env();assert.equal(await recordUsage(e,'proof_verified',{request:new Request('https://accordtrace.test/',{headers:{'x-accordtrace-telemetry':'exclude'}})}),false);assert.equal(e.writes.length,0);
});
