import fs from 'node:fs';
import crypto from 'node:crypto';

const [command,...args]=process.argv.slice(2);
if(!command)fail('usage: passport-stripe-sandbox-e2e.mjs <prepare|checkout|browser|verify> ...');

if(command==='prepare')await prepare(args[0],args[1],args[2]);
else if(command==='checkout')await checkout(args[0],args[1],args[2]||'referred');
else if(command==='browser')await browser(args[0]);
else if(command==='verify')await verify(args[0],args[1],args[2]||'referred');
else fail(`unknown command: ${command}`);

async function prepare(statePath,seedPath,issuerPath){
  required(statePath,'state path');required(seedPath,'seed path');required(issuerPath,'issuer path');
  const referrer=agent('referrer');
  const referred=agent('referred');
  const unattributed=agent('unattributed');
  const issuer=crypto.generateKeyPairSync('ed25519');
  const referralCode=`ATE2E${crypto.randomBytes(8).toString('hex').toUpperCase()}`;
  const now=new Date().toISOString();
  const attributionId=`attr_e2e_${crypto.randomBytes(12).toString('hex')}`;
  const state={version:1,created_at:now,referral_code:referralCode,attribution_id:attributionId,agents:{referrer,referred,unattributed},orders:{}};
  fs.writeFileSync(statePath,JSON.stringify(state,null,2),{mode:0o600});
  fs.writeFileSync(issuerPath,JSON.stringify(issuer.privateKey.export({format:'jwk'})),{mode:0o600});
  const rows=[referrer,referred,unattributed].map(a=>`INSERT INTO agent_passports(id,public_key,status,last_signed_at,created_at,updated_at) VALUES('${sql(a.id)}','${sql(a.public_key)}','active','${sql(now)}','${sql(now)}','${sql(now)}');`).join('\n');
  const sqlText=`PRAGMA foreign_keys = ON;\n${rows}\nINSERT INTO affiliate_profiles(passport_id,referral_code,status,terms_version,enrollment_request_id,accepted_at,created_at,updated_at) VALUES('${sql(referrer.id)}','${sql(referralCode)}','active','e2e','enroll_e2e_${crypto.randomBytes(8).toString('hex')}','${sql(now)}','${sql(now)}','${sql(now)}');\nINSERT INTO affiliate_attributions(id,referrer_passport_id,referred_passport_id,referral_code,state,risk_flags_json,attributed_at,created_at,updated_at) VALUES('${sql(attributionId)}','${sql(referrer.id)}','${sql(referred.id)}','${sql(referralCode)}','reserved','[]','${sql(now)}','${sql(now)}','${sql(now)}');\n`;
  fs.writeFileSync(seedPath,sqlText,{mode:0o600});
  console.log(JSON.stringify({status:'prepared',referrer_passport_id:referrer.id,referred_passport_id:referred.id,unattributed_passport_id:unattributed.id,referral_code:referralCode,attribution_id:attributionId,real_funds:false},null,2));
}

async function checkout(base,statePath,kind){
  const state=readState(statePath);const who=pickBuyer(state,kind);const baseUrl=safeBase(base);
  const requestId=`checkout_e2e_${crypto.randomBytes(12).toString('hex')}`;
  const requestedAt=new Date().toISOString();
  const referralCode=kind==='referred'?state.referral_code:null;
  const payload={domain:'accordtrace.passport-product.checkout.v1',request_id:requestId,passport_id:who.id,product_id:'agent_passport_certificate',product_version:'1',referral_code:referralCode,requested_at:requestedAt};
  const signature=crypto.sign(null,Buffer.from(canonicalize(payload)),crypto.createPrivateKey({key:Buffer.from(who.private_key_pkcs8,'base64url'),format:'der',type:'pkcs8'})).toString('base64url');
  const response=await fetch(new URL('/api/v1/passport-product/checkout',baseUrl),{method:'POST',headers:{'content-type':'application/json','accept':'application/json','x-accordtrace-telemetry':'exclude'},body:JSON.stringify({...payload,signature})});
  const body=await response.json().catch(()=>({}));
  if(response.status!==201)fail(`checkout failed (${response.status}): ${JSON.stringify(body)}`);
  const session=String(body.checkout_session_id||'');const url=String(body.checkout_url||'');
  if(!session.startsWith('cs_test_'))fail(`refusing non-test Checkout session: ${session||'missing'}`);
  const checkoutUrl=new URL(url);if(checkoutUrl.protocol!=='https:'||checkoutUrl.hostname!=='checkout.stripe.com')fail('unexpected Stripe Checkout URL');
  if(body?.order?.payment_status!=='pending')fail(`unexpected initial order state: ${body?.order?.payment_status}`);
  state.orders[kind]={order_id:body.order.id,checkout_session_id:session,checkout_url:url,request_id:requestId,created_at:new Date().toISOString()};
  writeState(statePath,state);
  console.log(JSON.stringify({status:'checkout_created',kind,order_id:body.order.id,checkout_session_id:session,checkout_url:url,real_funds:false},null,2));
}

async function browser(statePath){
  const state=readState(statePath);const pending=Object.entries(state.orders).filter(([,v])=>v?.checkout_url&&!v.completed_at);
  if(!pending.length)fail('no pending sandbox checkout in state');
  const {chromium}=await import('playwright');
  const browser=await chromium.launch({headless:true});
  try{
    for(const [kind,entry] of pending){
      if(!String(entry.checkout_session_id).startsWith('cs_test_'))fail('refusing browser automation for non-test Checkout session');
      const page=await browser.newPage();
      await page.goto(entry.checkout_url,{waitUntil:'domcontentloaded',timeout:60000});
      await fillFirst(page,["input[type='email']","input[name='email']"],'accordtrace-e2e@example.com',false);
      await fillFirst(page,["input[name='cardNumber']","input#cardNumber","input[autocomplete='cc-number']"],'4242424242424242');
      await fillFirst(page,["input[name='cardExpiry']","input#cardExpiry","input[autocomplete='cc-exp']"],'1234');
      await fillFirst(page,["input[name='cardCvc']","input#cardCvc","input[autocomplete='cc-csc']"],'123');
      await fillFirst(page,["input[name='billingName']","input#billingName","input[autocomplete='cc-name']"],'AccordTrace Sandbox E2E',false);
      const button=page.locator("button[type='submit']").last();
      await button.waitFor({state:'visible',timeout:30000});
      await button.click();
      await page.waitForURL(url=>url.origin!==new URL(entry.checkout_url).origin,{timeout:60000,waitUntil:'domcontentloaded'});
      entry.completed_at=new Date().toISOString();
      await page.close();
    }
    writeState(statePath,state);
    console.log(JSON.stringify({status:'hosted_checkout_completed',sessions:pending.map(([kind,v])=>({kind,checkout_session_id:v.checkout_session_id})),test_card_only:true,real_funds:false},null,2));
  }finally{await browser.close();}
}

async function verify(base,statePath,kind){
  const state=readState(statePath);const entry=state.orders[kind];if(!entry?.order_id)fail(`missing ${kind} order`);const baseUrl=safeBase(base);
  let orderBody;
  for(let i=0;i<30;i++){
    const response=await fetch(new URL(`/api/v1/passport-product/orders/${encodeURIComponent(entry.order_id)}`,baseUrl),{headers:{accept:'application/json','x-accordtrace-telemetry':'exclude'}});
    orderBody=await response.json().catch(()=>({}));
    if(response.ok&&['fulfilled','refunded','chargeback'].includes(orderBody?.order?.payment_status))break;
    await new Promise(r=>setTimeout(r,2000));
  }
  if(orderBody?.order?.payment_status!=='fulfilled')fail(`order not fulfilled by verified webhook: ${JSON.stringify(orderBody)}`);
  if(orderBody?.order?.amount_total!==200||String(orderBody?.order?.currency).toLowerCase()!=='usd')fail('fulfilled order amount/currency mismatch');
  if(!orderBody?.certificate?.id)fail('fulfilled order has no certificate');
  const certResponse=await fetch(new URL(orderBody.certificate.url,baseUrl),{headers:{accept:'application/json','x-accordtrace-telemetry':'exclude'}});
  const certBody=await certResponse.json();if(!certResponse.ok||!certBody?.certificate)fail('certificate fetch failed');
  const verifyResponse=await fetch(new URL('/api/v1/passport-product/certificates/verify',baseUrl),{method:'POST',headers:{'content-type':'application/json','accept':'application/json','x-accordtrace-telemetry':'exclude'},body:JSON.stringify({certificate:certBody.certificate})});
  const verified=await verifyResponse.json().catch(()=>({}));if(!verifyResponse.ok||verified?.valid!==true)fail(`certificate verification failed: ${JSON.stringify(verified)}`);
  entry.verified_at=new Date().toISOString();entry.certificate_id=orderBody.certificate.id;writeState(statePath,state);
  console.log(JSON.stringify({status:'verified',kind,order_id:entry.order_id,certificate_id:orderBody.certificate.id,payment_status:orderBody.order.payment_status,amount_total:orderBody.order.amount_total,currency:orderBody.order.currency,issuer_signature_valid:true,real_funds:false},null,2));
}

function agent(label){
  const {publicKey,privateKey}=crypto.generateKeyPairSync('ed25519');
  const publicPem=publicKey.export({type:'spki',format:'pem'}).toString();
  const digest=crypto.createHash('sha256').update(publicKey.export({type:'spki',format:'der'})).digest('hex');
  return{label,id:`agtp_${digest}`,public_key:publicPem,private_key_pkcs8:privateKey.export({type:'pkcs8',format:'der'}).toString('base64url')};
}
function pickBuyer(state,kind){if(!['referred','unattributed'].includes(kind))fail('kind must be referred or unattributed');return state.agents[kind];}
async function fillFirst(page,selectors,value,requiredField=true){for(const selector of selectors){const locator=page.locator(selector).first();if(await locator.count()){try{await locator.fill(value,{timeout:5000});return true}catch{}}}if(requiredField)fail(`Stripe Checkout field not found: ${selectors.join(', ')}`);return false;}
function canonicalize(v){if(v===null||typeof v==='boolean'||typeof v==='string'||typeof v==='number')return JSON.stringify(v);if(Array.isArray(v))return`[${v.map(canonicalize).join(',')}]`;if(typeof v==='object')return`{${Object.keys(v).sort().map(k=>`${JSON.stringify(k)}:${canonicalize(v[k])}`).join(',')}}`;throw new Error('unsupported canonical value');}
function readState(path){required(path,'state path');return JSON.parse(fs.readFileSync(path,'utf8'));}
function writeState(path,state){fs.writeFileSync(path,JSON.stringify(state,null,2),{mode:0o600});}
function safeBase(value){const u=new URL(required(value,'base URL'));if(u.protocol!=='https:'&&!['localhost','127.0.0.1'].includes(u.hostname))fail('base URL must use https');return u;}
function required(v,name){if(!String(v||'').trim())fail(`${name} is required`);return String(v).trim();}
function sql(v){return String(v).replaceAll("'","''");}
function fail(message){console.error(message);process.exit(1);}
