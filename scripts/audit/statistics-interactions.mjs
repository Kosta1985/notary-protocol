import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import { serviceStats, affiliateStats } from './statistics-fixture.mjs';
import { pathToFileURL } from 'node:url';
const browsers = await import(pathToFileURL(process.env.PLAYWRIGHT_MODULE).href);
const engine = process.env.BROWSER_ENGINE || 'chromium';
assert.ok(['chromium', 'firefox', 'webkit'].includes(engine), 'Unsupported browser engine');
const origin='https://website-fixture.accordtrace.test';
const assets=path.resolve('cloudflare/public');
const response=(body,status=200)=>({status,contentType:'application/json',body:JSON.stringify(body)});
const absent=()=>response({error:'not_found'},404);
const mime={'.html':'text/html','.js':'text/javascript','.css':'text/css','.json':'application/json','.svg':'image/svg+xml','.png':'image/png','.txt':'text/plain'};
const browser=await browsers[engine].launch({headless:true});
const browserVersion=browser.version();
const results=[];
async function scenario(name,route,api,run,{waitUntil='networkidle'}={}){
  const context=await browser.newContext({viewport:{width:390,height:844}});
  const calls=[],escaped=[],errors=[];
  await context.route('**/*',async intercepted=>{
    const request=intercepted.request(),url=new URL(request.url());
    if(url.origin!==origin){escaped.push(url.origin);return intercepted.abort()}
    if(url.pathname.startsWith('/api/')||url.pathname.startsWith('/v1/')){
      calls.push({path:url.pathname,method:request.method()});
      const result=await api(url.pathname,request);
      try{if(result?.abort)await intercepted.abort(result.abort);else await intercepted.fulfill(result||absent())}catch(error){if(!/closed|cancel|Invalid InterceptionId/i.test(error.message))throw error}
      return;
    }
    if(request.method()!=='GET'){escaped.push(request.method()+' '+url.pathname);return intercepted.abort()}
    const relative=url.pathname==='/'?'index.html':url.pathname.slice(1);
    const file=path.resolve(assets,relative);
    if(!file.startsWith(assets+path.sep))return intercepted.abort();
    try{await intercepted.fulfill({body:await fs.readFile(file),contentType:mime[path.extname(file)]||'application/octet-stream'})}
    catch{await intercepted.fulfill({status:404,body:''})}
  });
  const page=await context.newPage();page.on('pageerror',error=>errors.push(error.message));
  const item={name,ok:false,requests:calls};
  try{
    await page.goto(origin+route,{waitUntil});
    await run(page,calls);
    assert.deepEqual(errors,[],'No uncaught script errors');assert.deepEqual(escaped,[],'Fixture never contacts an external service');
    item.ok=true;
  }catch(error){item.error=error.message;item.script_errors=errors;item.unexpected_requests=escaped}
  finally{await context.close()}
  results.push(item);console.log(`${item.ok?'PASS':'FAIL'} ${name}${item.error?' - '+item.error:''}`);
}
try{
  await scenario('statistics preserve service data on affiliate connection failure','/stats.html',p=>p==='/v1/stats'?response(serviceStats()):{abort:'connectionfailed'},async(page,calls)=>{
    assert.equal(await page.locator('#stats-summary').isVisible(),true);
    assert.match(await page.locator('#stats-summary').innerText(),/Page View/);
    assert.equal(await page.locator('#affiliate-summary').isVisible(),false);
    assert.match(await page.locator('#affiliate-stats-note').innerText(),/could not be reached/);
    assert.equal(calls.every(c=>c.method==='GET'),true);
  });
  await scenario('statistics incomplete affiliates are not displayed as zero sales','/stats.html',p=>response(p==='/v1/stats'?serviceStats():{}),async page=>{
    assert.equal(await page.locator('#stats-summary').isVisible(),true);
    assert.equal(await page.locator('#affiliate-summary').isVisible(),false);
    assert.match(await page.locator('#affiliate-stats-note').innerText(),/incomplete or inconsistent/);
    assert.doesNotMatch(await page.locator('#affiliate-summary').innerText(),/0/);
  });
  await scenario('statistics retain affiliates while malformed service stays unknown','/stats.html',p=>response(p==='/v1/stats'?{}:affiliateStats()),async page=>{
    assert.equal(await page.locator('#affiliate-summary').isVisible(),true);
    assert.equal(await page.locator('#stats-summary').isVisible(),false);
    assert.equal(await page.locator('#stats-table').isVisible(),false);
    assert.match(await page.locator('#stats-status').innerText(),/No totals have been inferred/);
  });
  let releaseSlow; const slow = new Promise(resolve => { releaseSlow = resolve; });
  await scenario('statistics render the ready panel before the slow panel','/stats.html',async p=>{
    if(p.includes('/network/')){await slow;return response(affiliateStats())}return response(serviceStats());
  },async page=>{
    try{
      await page.waitForFunction(()=>document.querySelector('#service-panel').getAttribute('aria-busy')==='false');
      assert.equal(await page.locator('#affiliate-panel').getAttribute('aria-busy'),'true');
      assert.equal(await page.locator('#stats-summary').isVisible(),true);
    }finally{releaseSlow()}
    await page.waitForFunction(()=>document.querySelector('#affiliate-panel').getAttribute('aria-busy')==='false');
  },{waitUntil:'domcontentloaded'});
  let statsAttempt=0;
  await scenario('statistics retry replaces tables and never retains a failed snapshot','/stats.html',p=>{
    if(p==='/v1/stats'){statsAttempt++;return statsAttempt===2?response({}):response(serviceStats())}return response(affiliateStats());
  },async page=>{
    const columns=await page.locator('#stats-head th').count();assert.equal(columns,4);
    await page.locator('#stats-refresh').click();await page.waitForFunction(()=>!document.querySelector('#stats-refresh').disabled);
    assert.equal(await page.locator('#stats-summary').isVisible(),false);assert.equal(await page.locator('#stats-table').isVisible(),false);
    await page.locator('#stats-refresh').focus();await page.keyboard.press('Enter');await page.waitForFunction(()=>!document.querySelector('#stats-refresh').disabled);
    assert.equal(await page.locator('#stats-head th').count(),columns);assert.equal(await page.locator('#stats-body tr').count(),1);
    assert.equal(await page.locator('#stats-summary').isVisible(),true);
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+2),false);
  });
  await scenario('unreported agent metrics show a dash, not zero users','/stats.html',p=>response(p==='/v1/stats'?{...serviceStats(),agents:{active:{active24h:2}}}:affiliateStats()),async page=>{
    const values=await page.locator('#agent-summary strong').allTextContents();assert.equal(values[0],'2');assert.equal(values[1],'\u2014');
    assert.match(await page.locator('#agent-stats-note').innerText(),/not reported, not zero/);
  });
  await scenario('activity hides impossible event ratios and draws true zero bars','/activity.html',()=>{
    const data=serviceStats();data.totals.demo_loaded=10;data.daily[0].demo_loaded=10;
    data.daily.unshift({day:'2026-09-04',verification_started:0});return response(data);
  },async page=>{
    assert.equal(await page.locator('#rate-demo').innerText(),'\u2014');
    assert.match(await page.locator('#activity-ratio-note').innerText(),/not customer conversion rates/);
    assert.equal(await page.locator('#activity-chart i').first().evaluate(el=>el.style.width),'0%');
    assert.equal(await page.locator('#metric-views').innerText(),'4');
  });
  let activityAttempt=0;
  await scenario('activity retries a malformed snapshot without invented counts','/activity.html',()=>response(++activityAttempt===1?{}:serviceStats()),async page=>{
    assert.equal(await page.locator('#activity-updated').innerText(),'Unavailable');
    assert.equal(await page.locator('#metric-views').innerText(),'\u2014');
    await page.locator('#activity-refresh').click();await page.waitForFunction(()=>!document.querySelector('#activity-refresh').disabled);
    assert.equal(await page.locator('#metric-views').innerText(),'4');assert.equal(await page.locator('#activity-chart time').count(),1);
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+2),false);
  });
  await scenario('modern proof and protocol activity is not replaced by legacy counters','/activity.html',()=>{
    const data=serviceStats();const counters={proof_created:7,proof_verified:3,mcp_request:11,a2a_request:5,verification_valid:777};
    Object.assign(data.totals,counters);Object.assign(data.daily[0],counters);return response(data);
  },async page=>{
    assert.equal(await page.locator('#metric-proofs-created').innerText(),'7');
    assert.equal(await page.locator('#metric-proofs-verified').innerText(),'3');
    assert.equal(await page.locator('#metric-mcp-requests').innerText(),'11');
    assert.equal(await page.locator('#metric-a2a-requests').innerText(),'5');
    assert.equal(await page.locator('#metric-verifications').innerText(),'2');
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+2),false);
  });
  await scenario('statistics errors never echo upstream private diagnostics','/stats.html',()=>response({error:'sensitive upstream diagnostic'},503),async page=>{
    assert.doesNotMatch(await page.locator('body').innerText(),/sensitive upstream/);
    assert.match(await page.locator('#stats-status').innerText(),/temporarily unavailable/);
    assert.equal(await page.locator('#stats-refresh').isEnabled(),true);
  });
}finally{await browser.close()}
await fs.mkdir('.audit',{recursive:true});
await fs.writeFile('.audit/statistics-interactions.json',JSON.stringify({checked_at:new Date().toISOString(),browser:engine,browser_version:browserVersion,scope:`Isolated ${engine} statistics UI fixtures. All requests are intercepted; no real service or payment is contacted.`,passed:results.filter(x=>x.ok).length,total:results.length,results},null,2));
if(results.some(x=>!x.ok))process.exitCode=1;
