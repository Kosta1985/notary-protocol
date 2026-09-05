import test from 'node:test';
import assert from 'node:assert/strict';
import { readJsonBody } from '../cloudflare/src/http-request.js';
import { secureResponse } from '../cloudflare/src/response-security.js';
import worker from '../cloudflare/src/worker-v2.js';
import { hashData } from '../cloudflare/src/proofs.js';
const post=(path,body)=>new Request('https://accordtrace.test'+path,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(body)});

test('public JSON and HTML responses get browser protections without losing CORS or status',async()=>{
  for(const type of ['application/json','text/html']){
    const result=await secureResponse(new Response('x',{status:404,headers:{'content-type':type,'access-control-allow-origin':'*'}}));
    assert.equal(result.status,404);assert.equal(result.headers.get('x-content-type-options'),'nosniff');assert.equal(result.headers.get('referrer-policy'),'no-referrer');assert.match(result.headers.get('content-security-policy'),/frame-ancestors 'none'/);assert.equal(result.headers.get('access-control-allow-origin'),'*');
  }
});
test('unexpected errors redact internal SQL, secret-like strings and stale entity headers',async()=>{
  const result=await secureResponse(new Response('SQL table=private token=do-not-leak',{status:500,headers:{'content-type':'text/plain','etag':'old','content-length':'200','content-encoding':'gzip'}}));
  const body=await result.json();assert.equal(body.error,'internal_error');assert.match(body.request_id,/^[a-f0-9-]{36}$/);assert.doesNotMatch(JSON.stringify(body),/SQL|private|do-not-leak/);assert.equal(result.headers.get('content-length'),null);assert.equal(result.headers.get('etag'),null);assert.equal(result.headers.get('content-encoding'),null);
});
test('intentional activation-pending response keeps its safe diagnostics and status',async()=>{
  const result=await secureResponse(Response.json({error:'passport_product_checkout_not_ready',requirements:{checkout_activation:false}},{status:503}));
  assert.equal(result.status,503);assert.equal((await result.json()).requirements.checkout_activation,false);
});
test('existing stricter CSP is preserved and HEAD never carries a body',async()=>{
  const result=await secureResponse(new Response('body',{headers:{'content-security-policy':"default-src 'none'"}}),{method:'HEAD'});
  assert.equal(result.headers.get('content-security-policy'),"default-src 'none'");assert.equal(await result.text(),'');
});
test('streamed JSON parser handles split UTF-8 safely',async()=>{
  const bytes=new TextEncoder().encode('{"value":"\u20ac"}');
  const stream=new ReadableStream({start(c){c.enqueue(bytes.slice(0,11));c.enqueue(bytes.slice(11));c.close()}});
  assert.deepEqual(await readJsonBody(new Request('https://accordtrace.test',{method:'POST',body:stream,duplex:'half'})),{value:'\u20ac'});
});
test('streamed JSON enforces actual size despite a false or absent content-length',async()=>{
  const stream=new ReadableStream({start(c){c.enqueue(new TextEncoder().encode('"'+'a'.repeat(120)+'"'));c.close()}});
  await assert.rejects(readJsonBody(new Request('https://accordtrace.test',{method:'POST',headers:{'content-length':'1'},body:stream,duplex:'half'}),{maxBytes:100}),e=>e.status===413);
});
test('declared oversized content is rejected before reading',async()=>{
  await assert.rejects(readJsonBody(new Request('https://accordtrace.test',{method:'POST',headers:{'content-length':'2000000'},body:'{}'})),e=>e.status===413);
});
test('JSON object endpoints reject null, arrays and scalar data with 400 not 500',async()=>{
  for(const value of [null,[],42,'string']){
    for(const path of ['/api/v1/proofs','/api/v1/verify','/mcp']){
      const result=await worker.fetch(post(path,value),{},{});assert.equal(result.status,400,path);assert.match((await result.json()).message,/JSON object/);
    }
  }
});
test('hash endpoint intentionally supports null and scalar JSON values',async()=>{
  for(const value of [null,42,'string',[]]){
    const response=await worker.fetch(post('/api/v1/hash',value),{},{});assert.equal(response.status,200);assert.equal((await response.json()).hash,await hashData(value));
  }
});
test('invalid UTF-8 JSON is rejected instead of silently replacing bytes',async()=>{
  const request=new Request('https://accordtrace.test',{method:'POST',body:new Uint8Array([123,34,97,34,58,34,255,34,125])});
  await assert.rejects(readJsonBody(request),e=>e.status===400);
});
test('malformed escaped proof ID is a client error',async()=>{
  const response=await worker.fetch(new Request('https://accordtrace.test/api/v1/proofs/%ZZ'),{},{});
  assert.equal(response.status,400);assert.match((await response.json()).message,/Invalid proof_id/);
});
test('unexpected database failures are redacted at the outer worker boundary',async()=>{
  const response=await worker.fetch(new Request('https://accordtrace.test/api/v1/proofs/atp_'+'a'.repeat(32)),{DB:{prepare(){throw new Error('SQL no such table credential=hidden')}}},{});
  assert.equal(response.status,500);assert.doesNotMatch(await response.text(),/SQL|credential|hidden/);
});
test('early capabilities responses also receive no-sniff and referrer protection',async()=>{
  const response=await worker.fetch(new Request('https://accordtrace.test/api/v1/passport-product/capabilities'),{},{});
  assert.equal(response.status,200);assert.equal(response.headers.get('x-content-type-options'),'nosniff');assert.equal(response.headers.get('referrer-policy'),'no-referrer');assert.equal((await response.json()).commercial_ready,false);
});
test('unexpected JSON-RPC errors preserve their envelope and request ID while redacting details',async()=>{
  const result=await secureResponse(Response.json({jsonrpc:'2.0',id:'client-request-1',error:{code:-32603,message:'private SQL token=hidden'}},{status:500}));
  const body=await result.json();assert.equal(body.jsonrpc,'2.0');assert.equal(body.id,'client-request-1');assert.equal(body.error.code,-32603);assert.doesNotMatch(body.error.message,/SQL|hidden/);assert.match(body.error.data.request_id,/^[a-f0-9-]{36}$/);
});
