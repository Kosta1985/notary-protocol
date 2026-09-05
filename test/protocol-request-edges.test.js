import test from 'node:test';
import assert from 'node:assert/strict';
import worker from '../cloudflare/src/worker-v2.js';
import { hashData } from '../cloudflare/src/proofs.js';
const endpoint = path => `https://accordtrace.test${path}`;
const post = (path, body) => new Request(endpoint(path), {method:'POST',headers:{'content-type':'application/json','x-notary-monitor':'edge-fixture'},body:typeof body==='string'?body:JSON.stringify(body)});
const rpc = (method, params, id = 'edge-request') => ({jsonrpc:'2.0',id,method,params});
function noWrites() {
  const calls = [];
  return { calls, env: {DB:{prepare(sql){calls.push(sql);throw Error('Unexpected database call');}},ASSETS:{fetch(){return new Response(null,{status:404})}}} };
}

test('unsupported A2A method returns a protocol error instead of rereading a consumed body', async () => {
  const h=noWrites(),res=await worker.fetch(post('/a2a',rpc('unsupported/fixture',{})),h.env,{}),body=await res.json();
  assert.equal(res.status,200);assert.equal(body.error.code,-32601);assert.equal(body.id,'edge-request');assert.deepEqual(h.calls,[]);
});
test('A2A parts must be an array and cannot crash message extraction', async () => {
  const h=noWrites(),res=await worker.fetch(post('/a2a',rpc('SendMessage',{message:{parts:{data:{action:'hash_content'}}}})),h.env,{}),body=await res.json();
  assert.equal(res.status,400);assert.equal(body.error.code,-32602);assert.deepEqual(h.calls,[]);
});
test('MCP rejects scalar or array arguments before executing a tool', async () => {
  for(const args of [null,[],3,'bad']){
    const h=noWrites(),res=await worker.fetch(post('/mcp',rpc('tools/call',{name:'accord_trace_network_capabilities',arguments:args})),h.env,{});
    assert.equal(res.status,400);assert.equal((await res.json()).error.code,-32602);assert.deepEqual(h.calls,[]);
  }
});
test('MCP rejects invalid params without coercing them to empty arguments',async()=>{
  for(const params of [null,[],23,'bad']){
    const h=noWrites(),res=await worker.fetch(post('/mcp',rpc('tools/list',params)),h.env,{});
    assert.equal(res.status,400);assert.equal((await res.json()).error.code,-32602);assert.deepEqual(h.calls,[]);
  }
});
test('MCP tool dispatch does not resolve inherited Object prototype names',async()=>{
  for(const name of ['constructor','toString','__proto__']){
    const h=noWrites(),res=await worker.fetch(post('/mcp',rpc('tools/call',{name,arguments:{}})),h.env,{});
    assert.equal((await res.json()).error.code,-32601);assert.deepEqual(h.calls,[]);
  }
});
test('invalid JSON-RPC IDs and versions are rejected without reflecting supplied objects',async()=>{
  for(const extra of [{id:{private:'fixture'}},{id:true},{id:'a'.repeat(201)},{jsonrpc:'1.0'},{method:{private:'fixture'}}]){
    const h=noWrites(),res=await worker.fetch(post('/mcp',{...rpc('tools/list',{}),...extra}),h.env,{}),body=await res.json();
    assert.equal(res.status,400);assert.equal(body.id,null);assert.equal(body.error.code,-32600);assert.doesNotMatch(JSON.stringify(body),/fixture/);assert.deepEqual(h.calls,[]);
  }
});
test('MCP notification is acknowledged without result or business execution',async()=>{
  const h=noWrites(),res=await worker.fetch(post('/mcp',{jsonrpc:'2.0',method:'notifications/cancelled',params:{requestId:'unused'}}),h.env,{});
  assert.equal(res.status,202);assert.equal(await res.text(),'');assert.deepEqual(h.calls,[]);
});
test('MCP supports a bounded ping and retains correlation ID',async()=>{
  const h=noWrites(),res=await worker.fetch(post('/mcp',rpc('ping',{},7)),h.env,{});
  assert.deepEqual(await res.json(),{jsonrpc:'2.0',id:7,result:{}});assert.deepEqual(h.calls,[]);
});
test('valid hash tools stay consistent through MCP and both A2A method names',async()=>{
  const data={nested:{z:[0,false,'unicode \u20ac'],a:-0}};
  const expected=await hashData(data),h=noWrites();
  const mcp=await worker.fetch(post('/mcp',rpc('tools/call',{name:'accord_trace_hash',arguments:{data}})),h.env,{});
  assert.equal((await mcp.json()).result.structuredContent.hash,expected);
  for(const method of ['SendMessage','message/send']){
    const res=await worker.fetch(post('/a2a',rpc(method,{message:{parts:[{data:{action:'hash_content',arguments:{data}}}]}})),h.env,{});
    assert.equal((await res.json()).result.task.artifacts[0].parts[0].data.hash,expected);
  }
});
test('deep JSON is rejected predictably before canonicalization and without database writes',async()=>{
  const nested='['.repeat(3000)+'0'+']'.repeat(3000);
  for(const path of ['/api/v1/hash','/api/v1/proofs']){
    const h=noWrites(),res=await worker.fetch(post(path,'{"data":'+nested+'}'),h.env,{});
    assert.equal(res.status,413);assert.match((await res.json()).message,/nesting/);assert.deepEqual(h.calls,[]);
  }
});
test('JSON node budget applies to wide payloads below the byte budget',async()=>{
  const h=noWrites(),res=await worker.fetch(post('/api/v1/hash',{data:Array(100001).fill(0)}),h.env,{});
  assert.equal(res.status,413);assert.deepEqual(h.calls,[]);
});
test('direct hash callers cannot overflow the canonicalizer stack',async()=>{
  let value=0;for(let i=0;i<3000;i++)value=[value];
  await assert.rejects(hashData(value),e=>e.status===413);
});
test('read-only metadata HEAD responses match GET headers and have no body',async()=>{
  for(const path of ['/health','/mcp','/a2a']){
    const h=noWrites(),get=await worker.fetch(new Request(endpoint(path)),h.env,{}),head=await worker.fetch(new Request(endpoint(path),{method:'HEAD'}),h.env,{});
    assert.equal(head.status,get.status,path);assert.equal(head.headers.get('content-type'),get.headers.get('content-type'));assert.equal(await head.text(),'');assert.deepEqual(h.calls,[]);
  }
});
test('unsupported methods on modern endpoints return 405 with Allow and no writes',async()=>{
  for(const [path,method,allow] of [['/mcp','PUT','GET, HEAD, POST, OPTIONS'],['/a2a','DELETE','GET, HEAD, POST, OPTIONS'],['/api/v1/hash','GET','POST, OPTIONS'],['/api/v1/proofs','DELETE','POST, OPTIONS']]){
    const h=noWrites(),res=await worker.fetch(new Request(endpoint(path),{method}),h.env,{});
    assert.equal(res.status,405);assert.equal(res.headers.get('allow'),allow);assert.deepEqual(h.calls,[]);
  }
});

test('MCP does not coerce malformed names, versions or identifiers into server errors',async()=>{
  const malformed={toString:null};
  for(const [method,params] of [
    ['initialize',{protocolVersion:malformed}],
    ['tools/call',{name:malformed,arguments:{}}],
    ['tools/call',{name:'accord_trace_get_proof',arguments:{proof_id:malformed}}],
    ['tools/call',{name:'accord_trace_resolve_referral',arguments:{referral_code:malformed}}]
  ]){
    const h=noWrites(),res=await worker.fetch(post('/mcp',rpc(method,params)),h.env,{});
    assert.equal(res.status,400);assert.equal((await res.json()).error.code,-32602);assert.deepEqual(h.calls,[]);
  }
});
test('A2A rejects null arguments and overlong action names with bounded errors',async()=>{
  for(const data of [{action:'hash_content',arguments:null},{action:'a'.repeat(1024),arguments:{}}]){
    const h=noWrites(),res=await worker.fetch(post('/a2a',rpc('SendMessage',{message:{parts:[{data}]}})),h.env,{});
    assert.equal(res.status,400);assert.ok((await res.text()).length<500);assert.deepEqual(h.calls,[]);
  }
});
test('ordinary supported JSON hashing is unchanged by the complexity guard',async()=>{
  assert.equal(await hashData({b:2,a:1}),'sha256:43258cff783fe7036d8a43033f830adfc60ec037382473548ac742b888292777');
});
