import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import worker from '../cloudflare/src/worker-v2.js';
const origin='https://accordtrace.test';
const assetEnv={ASSETS:{async fetch(request){return new URL(request.url).pathname==='/404.html'?new Response(fs.readFileSync(new URL('../web/404.html',import.meta.url),'utf8'),{headers:{'content-type':'text/html'}}):new Response(null,{status:404})}}};
test('discovery cards point at an existing developer guide rather than removed docs page',()=>{
  for(const file of ['web/.well-known/agent.json','web/.well-known/mcp.json','adapters/a2a/agent-card.json']){
    const body=JSON.parse(fs.readFileSync(new URL('../'+file,import.meta.url),'utf8'));
    assert.equal(new URL(body.documentationUrl||body.documentation).pathname,'/developers.html');
  }
  const sitemap=fs.readFileSync(new URL('../web/sitemap.xml',import.meta.url),'utf8');
  const urls=[...sitemap.matchAll(/<loc>(.*?)<\/loc>/g)].map(m=>m[1]);
  assert.equal(new Set(urls).size,urls.length);assert.ok(!urls.some(u=>u.endsWith('/docs.html')));
});
test('previously published docs addresses redirect to the working guide',async()=>{
  for(const path of ['/docs','/docs.html']){
    const res=await worker.fetch(new Request(origin+path),assetEnv,{});
    assert.equal(res.status,308);assert.equal(res.headers.get('location'),origin+'/developers');
  }
});
test('unknown browser page provides real 404 and usable navigation without reflecting URL',async()=>{
  const res=await worker.fetch(new Request(origin+'/unknown-fixture?credential=never-reflect',{headers:{accept:'text/html'}}),assetEnv,{});
  assert.equal(res.status,404);assert.match(res.headers.get('content-type'),/text\/html/);
  const body=await res.text();assert.match(body,/Page not found/);assert.match(body,/\/developers.html/);assert.doesNotMatch(body,/never-reflect/);
});
test('unknown API remains JSON 404 even when browser requests HTML',async()=>{
  const res=await worker.fetch(new Request(origin+'/api/v1/unknown-fixture',{headers:{accept:'text/html'}}),assetEnv,{});
  assert.equal(res.status,404);assert.match(res.headers.get('content-type'),/application\/json/);assert.equal((await res.json()).error,'not_found');
});
test('missing script does not become an HTML success or custom page',async()=>{
  const res=await worker.fetch(new Request(origin+'/missing-fixture.js',{headers:{accept:'text/html'}}),assetEnv,{});
  assert.equal(res.status,404);assert.equal(await res.text(),'');
});

test('404 recovery follows only the canonical same-origin HTML asset redirect',async()=>{
  const env={ASSETS:{async fetch(request){
    const path=new URL(request.url).pathname;
    if(path==='/404.html')return Response.redirect(origin+'/404',307);
    if(path==='/404')return new Response('<h1>Page not found</h1>',{headers:{'content-type':'text/html'}});
    return new Response(null,{status:404});
  }}};
  const res=await worker.fetch(new Request(origin+'/unknown-fixture',{headers:{accept:'text/html'}}),env,{});
  assert.equal(res.status,404);assert.match(await res.text(),/Page not found/);
});
test('unavailable 404 asset preserves the original missing-page response',async()=>{
  const env={ASSETS:{async fetch(request){
    if(new URL(request.url).pathname==='/404.html')throw Error('asset unavailable');
    return new Response(null,{status:404});
  }}};
  const res=await worker.fetch(new Request(origin+'/unknown-fixture',{headers:{accept:'text/html'}}),env,{});
  assert.equal(res.status,404);assert.equal(await res.text(),'');
});
