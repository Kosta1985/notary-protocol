import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import { pathToFileURL } from 'node:url';
const browsers = await import(pathToFileURL(process.env.PLAYWRIGHT_MODULE).href);
const engine = process.env.BROWSER_ENGINE || 'chromium';
assert.ok(['chromium', 'firefox', 'webkit'].includes(engine), 'Unsupported browser engine');
const origin='https://website-fixture.accordtrace.test';
const assets=path.resolve('cloudflare/public');
const agent='agtp_'+'a'.repeat(64),proof='atp_'+'b'.repeat(32),receipt='ntr_'+'c'.repeat(24),cert='atpc_'+'d'.repeat(32);
const response=(body,status=200)=>({status,contentType:'application/json',body:JSON.stringify(body)});
const absent=()=>response({error:'not_found'},404);
const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));
const mime={'.html':'text/html','.js':'text/javascript','.css':'text/css','.json':'application/json','.svg':'image/svg+xml','.png':'image/png','.txt':'text/plain'};
const browser=await browsers[engine].launch({headless:true});
const browserVersion=browser.version();
const results=[];
async function scenario(name,route,api,run){
  const context=await browser.newContext({viewport:{width:390,height:844}});
  const calls=[],escaped=[],errors=[];
  await context.route('**/*',async intercepted=>{
    const request=intercepted.request(),url=new URL(request.url());
    if(url.origin!==origin){escaped.push(url.origin);return intercepted.abort()}
    if(url.pathname.startsWith('/api/')||url.pathname.startsWith('/v1/')){
      calls.push({path:url.pathname,method:request.method()});
      const result=await api(url.pathname,request);
      try{await intercepted.fulfill(result||absent())}catch(error){if(!/closed|cancel|Invalid InterceptionId/i.test(error.message))throw error}
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
    await page.goto(origin+route,{waitUntil:'networkidle'});
    await run(page,calls);
    assert.deepEqual(errors,[],'No uncaught script errors');assert.deepEqual(escaped,[],'Fixture never contacts an external service');
    item.ok=true;
  }catch(error){item.error=error.message;item.script_errors=errors;item.unexpected_requests=escaped}
  finally{await context.close()}
  results.push(item);console.log(`${item.ok?'PASS':'FAIL'} ${name}${item.error?' - '+item.error:''}`);
}
async function verify(page,id){
  await page.locator('#verify-id').fill(id);await page.locator('#verify-form button').click();
  await page.waitForFunction(()=>document.querySelector('#verify-result').getAttribute('aria-busy')==='false');
  return page.locator('#verify-result').innerText();
}
const primary=()=>response({passport:{id:agent,status:'active'}});
try{
  await scenario('missing receipt is not successful null evidence','/verify.html',absent,async(page,calls)=>{
    const text=await verify(page,receipt);assert.match(text,/Not verified/);assert.doesNotMatch(text,/successfully/);assert.deepEqual(calls,[{path:'/v1/receipts/'+receipt,method:'GET'}]);
  });
  await scenario('current proof invokes verification endpoint','/verify.html',p=>p==='/api/v1/verify'?response({proof_id:proof,valid:true,integrity_mode:'issuer_signed_hash',signature_valid:true}):absent(),async(page,calls)=>{
    assert.match(await verify(page,proof),/Proof signature verified/);assert.deepEqual(calls,[{path:'/api/v1/verify',method:'POST'}]);
  });
  await scenario('unsigned proof does not claim issuer signature','/verify.html',()=>response({proof_id:proof,valid:true,integrity_mode:'service_recorded_hash',signature_valid:null}),async page=>{
    assert.match(await verify(page,proof),/no issuer signature/);assert.equal(await page.locator('#verify-result').getAttribute('data-outcome'),'record');
  });
  await scenario('negative signature verdict is negative on HTTP 200','/verify.html',()=>response({proof_id:proof,valid:false,integrity_mode:'issuer_signed_hash',signature_valid:false}),async page=>{
    assert.match(await verify(page,proof),/verification failed/);assert.equal(await page.locator('#verify-result').getAttribute('data-outcome'),'invalid');
  });
  await scenario('refunded Certificate remains historical, not active','/verify.html',p=>p.endsWith('/verify')?response({certificate_id:cert,valid:true}):response({certificate:{id:cert,issuer:{}},state:'refunded'}),async page=>{
    assert.match(await verify(page,cert),/Historical signature verified - refunded/);assert.equal(await page.locator('#verify-result').getAttribute('data-outcome'),'record');
  });
  await scenario('malformed successful response never confirms evidence','/verify.html',()=>response({}),async page=>{assert.match(await verify(page,'vreq_test'),/Not verified/)});
  await scenario('editing input invalidates the older in-flight response','/verify.html',async(_p,request)=>{
    const id=request.postDataJSON().proof_id;if(id===proof)await sleep(300);
    return response({proof_id:id,valid:true,integrity_mode:'service_recorded_hash',signature_valid:null});
  },async(page,calls)=>{
    await page.locator('#verify-id').fill(proof);await page.locator('#verify-form button').click();
    await page.waitForTimeout(40);const newer='atp_'+'e'.repeat(32);await verify(page,newer);await page.waitForTimeout(350);
    const text=await page.locator('#verify-result').innerText();assert.ok(text.includes(newer));assert.ok(!text.includes(proof));
  });
  await scenario('supplemental outage is visible without losing Passport','/agents.html',p=>p.includes('/security/passports/')?primary():p.includes('/validation/')?response({error:'fixture outage'},503):absent(),async page=>{
    await page.locator('#agent-id').fill(agent);await page.locator('#agent-form button').click();
    await page.waitForFunction(()=>document.querySelector('#agent-state').getAttribute('aria-busy')==='false');
    assert.match(await page.locator('#agent-state').innerText(),/some supplementary/);assert.match(await page.locator('#validations').innerText(),/not evidence of no validations/);assert.match(await page.locator('#summary').innerText(),/Unknown/);
  });
  await scenario('bad Certificate URLs never become clickable script links','/agents.html',p=>p.includes('/security/passports/')?primary():p.includes('/passport-product/')?response({passport_id:agent,certificate:{id:cert,state:'active',url:'javascript:alert(1)'}}):absent(),async page=>{
    await page.locator('#agent-id').fill(agent);await page.locator('#agent-form button').click();await page.waitForFunction(()=>document.querySelector('#agent-state').getAttribute('aria-busy')==='false');assert.equal(await page.locator('a[href^="javascript:"]').count(),0);
  });
  await scenario('failed validation never generates a positive share badge','/agents.html',p=>p.includes('/security/passports/')?primary():p.includes('/validation/')?response({passport_id:agent,validations:[{validation_type:'domain_control',outcome:'failed',effective_status:'failed'}]}):absent(),async page=>{
    await page.locator('#agent-id').fill(agent);await page.locator('#agent-form button').click();await page.waitForFunction(()=>document.querySelector('#agent-state').getAttribute('aria-busy')==='false');assert.equal(await page.locator('[data-copy]').count(),0);
  });
  await scenario('clearing operator token defeats delayed in-flight response','/console.html',async p=>{
    if(p.endsWith('/capabilities')){await sleep(300);return response({version:'fixture'})}
    if(p.endsWith('/summary'))return response({summary:{}});
    return response({incidents:[]});
  },async page=>{
    await page.locator('#token').fill('fixture-operator-token-not-real');await page.locator('#connect').click();await page.waitForTimeout(40);await page.locator('#clear').click();await page.waitForTimeout(400);
    assert.equal(await page.locator('#token').inputValue(),'');assert.equal(await page.locator('#app').isVisible(),false);assert.equal(await page.locator('#summary').innerText(),'');assert.match(await page.locator('#status').innerText(),/Token cleared/);
  });
  await scenario('waitlist double submit sends only one mocked request','/',async p=>{
    if(p.endsWith('/waitlist')){await sleep(200);return response({accepted:true,status:'waiting'},201)}return response({});
  },async(page,calls)=>{
    await page.locator('#interest-email').fill('fixture@example.invalid');
    await page.locator('#interest-form').evaluate(form=>{form.dispatchEvent(new Event('submit',{bubbles:true,cancelable:true}));form.dispatchEvent(new Event('submit',{bubbles:true,cancelable:true}))});
    await page.waitForFunction(()=>document.querySelector('#interest-status').textContent.includes('request has been received'));
    assert.equal(calls.filter(c=>c.path.endsWith('/waitlist')).length,1);
  });
  await scenario('incomplete referral JSON does not show an active referral','/network.html?ref=atr_0123456789abcdef',()=>response({}),async page=>{
    assert.match(await page.locator('#referral-status').innerText(),/could not be confirmed/);assert.equal(await page.locator('#buy-with-ref').isVisible(),false);
  });
  await scenario('invalid Passport input never enters the address bar','/agents.html',()=>{throw Error('must not fetch')},async(page,calls)=>{
    await page.locator('#agent-id').fill('sk_live_fixture_not_real');await page.locator('#agent-form button').click();
    await page.waitForFunction(()=>document.querySelector('#agent-state').getAttribute('aria-busy')==='false');
    assert.equal(calls.length,0);assert.equal(new URL(page.url()).search,'');assert.match(await page.locator('#agent-state').innerText(),/not a URL or private key/);
  });
  await scenario('404 recovery page offers keyboard-accessible navigation','/404.html',absent,async(page,calls)=>{
    assert.match(await page.title(),/Page not found/);
    await page.keyboard.press('Tab');
    assert.equal(await page.locator('.skip-link').evaluate(el=>el===document.activeElement),true);
    assert.equal(await page.locator('a[href="/developers.html"]').count(),2);
    assert.equal(await page.locator('a[href="/verify.html"]').count(),2);
    assert.equal(calls.length,0);
    const overflow=await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+2);
    assert.equal(overflow,false);
  });
  await scenario('waitlist confirms receipt without claiming renewed enrollment','/',p=>p.endsWith('/waitlist')?response({accepted:true,status:'received'},201):response({}),async page=>{
    await page.locator('#interest-email').fill('opted-out-fixture@example.invalid');
    await page.locator('#interest-form button[type="submit"]').click();
    await page.waitForFunction(()=>document.querySelector('#interest-form').getAttribute('aria-busy')==='false');
    const text=await page.locator('#interest-status').innerText();
    assert.match(text,/request has been received/);assert.match(text,/unsubscribe preferences/);assert.doesNotMatch(text,/You are on/);
  });
  await scenario('known credential prefixes are rejected without requests','/verify.html',()=>{throw Error('must not fetch')},async(page,calls)=>{
    assert.match(await verify(page,'sk_live_fixture_not_real'),/Not verified/);assert.equal(calls.length,0);
  });
}finally{await browser.close()}
await fs.mkdir('.audit',{recursive:true});
await fs.writeFile('.audit/website-interactions.json',JSON.stringify({checked_at:new Date().toISOString(),browser:engine,browser_version:browserVersion,scope:`Isolated ${engine} UI fixtures. Every network request is intercepted; no Stripe, Cloudflare or production API request occurs.`,passed:results.filter(x=>x.ok).length,total:results.length,results},null,2));
if(results.some(x=>!x.ok))process.exitCode=1;
