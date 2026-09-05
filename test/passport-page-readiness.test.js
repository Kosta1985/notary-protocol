import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const source=fs.readFileSync(new URL('../web/passport.js',import.meta.url),'utf8');
const product={product:{id:'agent_passport_certificate',price:{amount_atomic:200,currency:'usd'}},checkout_enabled:true,webhook_enabled:true,certificate_signing_enabled:true,referral_pricing_consistent:true,commercial_ready:true};
const network={direct_commission:{amount_atomic:100,currency:'usd'},cash_payouts_enabled:false};

async function render(productBody,options={}){
  const elements=new Map();
  const calls=[];
  const element=id=>{
    if(!elements.has(id)){
      const attrs=new Map(id==='buy-button'?[['aria-disabled','true']]:[]);
      const classes=new Set(id==='buy-button'?['disabled']:[]);
      elements.set(id,{textContent:'',hidden:true,attrs,classes,classList:{add:c=>classes.add(c),remove:c=>classes.delete(c)},setAttribute:(k,v)=>attrs.set(k,v),removeAttribute:k=>attrs.delete(k),getAttribute:k=>attrs.get(k)??null,addEventListener(){}});
    }
    return elements.get(id);
  };
  const context=vm.createContext({document:{getElementById:element},location:{search:''},URLSearchParams,Intl,AbortController,setTimeout,clearTimeout,fetch:async(path,init)=>{
    calls.push({path,init});
    const isProduct=path.includes('passport-product');
    const status=isProduct?(options.productStatus??200):(options.networkStatus??200);
    return{ok:status===200,status,json:async()=>isProduct?productBody:network};
  }});
  vm.runInContext(source,context);
  await new Promise(resolve=>setImmediate(resolve));
  return{get:element,calls};
}

test('missing signing gate is named without a readiness object, and checkout stays disabled',async()=>{
  const page=await render({...product,certificate_signing_enabled:false,commercial_ready:false});
  assert.match(page.get('product-status').textContent,/certificate signing/);
  assert.equal(page.get('buy-button').getAttribute('aria-disabled'),'true');
  assert.equal(page.get('buy-button').textContent,'Certificate signing not ready');
  assert.doesNotMatch(page.get('buy-button').textContent,/Stripe activation/);
});

test('configured checkout links to instructions without claiming payment verification',async()=>{
  const page=await render(product);
  assert.equal(page.get('buy-button').getAttribute('aria-disabled'),null);
  assert.match(page.get('buy-button').textContent,/checkout instructions/);
  assert.doesNotMatch(page.get('product-status').textContent,/production-ready|verified webhook/);
  assert.equal(page.calls.length,2);
  assert.ok(page.calls.every(x=>!x.init.method||x.init.method==='GET'));
});

test('optional network outage does not disable configured product checkout',async()=>{
  const page=await render(product,{networkStatus:503});
  assert.equal(page.get('buy-button').getAttribute('aria-disabled'),null);
  assert.equal(page.get('live-commission').textContent,'Unavailable');
  assert.equal(page.get('payout-status').textContent,'Unknown');
});

test('product policy outage fails closed even when referral policy succeeds',async()=>{
  const page=await render(product,{productStatus:503});
  assert.equal(page.get('buy-button').getAttribute('aria-disabled'),'true');
  assert.match(page.get('product-status').textContent,/temporarily unavailable/);
});

test('truthy non-boolean commercial_ready is never treated as readiness',async()=>{
  const page=await render({...product,commercial_ready:'false'});
  assert.equal(page.get('buy-button').getAttribute('aria-disabled'),'true');
});

test('contradictory ready state with a closed signing gate fails closed',async()=>{
  const page=await render({...product,certificate_signing_enabled:false});
  assert.equal(page.get('buy-button').getAttribute('aria-disabled'),'true');
});

test('malformed policy does not enable payment or expose raw server content',async()=>{
  for(const body of [null,[],{error:'do not display internal values'}, {...product,product:{id:'wrong-product',price:{amount_atomic:200,currency:'usd'}}}]){
    const page=await render(body);
    assert.equal(page.get('buy-button').getAttribute('aria-disabled'),'true');
    assert.doesNotMatch(page.get('checkout-copy').textContent,/internal values/);
  }
});
