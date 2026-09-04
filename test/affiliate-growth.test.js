import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { handleAffiliateGrowth } from '../cloudflare/src/affiliate-growth.js';

const read=p=>fs.readFileSync(new URL(`../${p}`,import.meta.url),'utf8');

function statsDb(){
  return {
    prepare(sql){
      return {
        async first(){
          if(sql.includes('FROM affiliate_profiles'))return{total:12,active:10};
          if(sql.includes('FROM affiliate_attributions'))return{total:8,reserved:2,held:1,qualified:4,rejected:0,reversed:1};
          if(sql.includes('FROM affiliate_commissions'))return{total:5,pending:2,earned:2,held:0,reversed:1,paid:0,pending_atomic:200,earned_atomic:200,paid_atomic:0};
          if(sql.includes("purpose='invite'"))return{total:31,last_30d:17};
          throw new Error(`Unexpected SQL: ${sql}`);
        }
      };
    }
  };
}

test('affiliate public stats separate invites, sales, earned and paid states',async()=>{
  const request=new Request('https://accordtrace.test/api/v1/network/stats');
  const response=await handleAffiliateGrowth(request,{DB:statsDb()},new URL(request.url));
  assert.equal(response.status,200);
  const body=await response.json();
  assert.equal(body.passport_price_atomic,200);
  assert.equal(body.direct_commission_atomic,100);
  assert.equal(body.invitation_payloads.last_30d,17);
  assert.equal(body.attributions.qualified_direct_sales,4);
  assert.equal(body.commissions.earned,2);
  assert.equal(body.commissions.paid,0);
  assert.equal(body.cash_payouts_enabled,false);
  assert.match(body.boundary,/invitation is not a customer, sale, earned commission or paid commission/i);
});

test('signed invitation generator creates one-level payload but performs no delivery',async()=>{
  const keys=await crypto.subtle.generateKey({name:'Ed25519'},true,['sign','verify']);
  const spki=new Uint8Array(await crypto.subtle.exportKey('spki',keys.publicKey));
  const publicKey=`-----BEGIN PUBLIC KEY-----\n${Buffer.from(spki).toString('base64').match(/.{1,64}/g).join('\n')}\n-----END PUBLIC KEY-----`;
  const passportId='agtp_test_passport';
  const requestId='req_invite_001';
  const requestedAt=new Date().toISOString();
  const recipientContext='Needs verifiable workflow evidence';
  const signed={domain:'accordtrace.affiliate.invitation.v1',request_id:requestId,passport_id:passportId,recipient_context:recipientContext,requested_at:requestedAt};
  const signatureBytes=await crypto.subtle.sign('Ed25519',keys.privateKey,new TextEncoder().encode(canonicalize(signed)));
  const signature=Buffer.from(signatureBytes).toString('base64url');
  let nonceWritten=false;
  const DB={prepare(sql){return{bind(){return this},async first(){
    if(sql.includes('FROM agent_passports'))return{id:passportId,public_key:publicKey,status:'active'};
    if(sql.includes('FROM affiliate_profiles'))return{passport_id:passportId,referral_code:'atr_0123456789abcdef',status:'active'};
    throw new Error(`Unexpected first SQL: ${sql}`);
  },async run(){if(sql.includes('affiliate_request_nonces')){nonceWritten=true;return{meta:{changes:1}}}throw new Error(`Unexpected run SQL: ${sql}`)}}}};
  const request=new Request('https://accordtrace.test/api/v1/network/invitations',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({passport_id:passportId,request_id:requestId,requested_at:requestedAt,recipient_context:recipientContext,signature})});
  const response=await handleAffiliateGrowth(request,{DB},new URL(request.url));
  assert.equal(response.status,201);
  const body=await response.json();
  assert.equal(nonceWritten,true);
  assert.equal(body.delivery_performed,false);
  assert.equal(body.invitation.incentive.levels,1);
  assert.equal(body.invitation.referral_code,'atr_0123456789abcdef');
  assert.match(body.invitation.referral_url,/network\.html\?ref=atr_0123456789abcdef/);
  assert.match(body.invitation.disclosure,/qualifying 2\.00 USD Agent Passport purchase/i);
  assert.match(body.anti_spam,/does not send messages/i);
});

test('worker routes growth layer before core affiliate handler',()=>{
  const worker=read('cloudflare/src/worker.js');
  assert.match(worker,/handleAffiliateGrowth/);
  assert.ok(worker.indexOf('handleAffiliateGrowth(request,env,url)')<worker.indexOf('handleAffiliate(request,env,url)'));
});

function canonicalize(v){if(v===null||typeof v==='boolean'||typeof v==='string'||typeof v==='number')return JSON.stringify(v);if(Array.isArray(v))return`[${v.map(canonicalize).join(',')}]`;return`{${Object.keys(v).sort().map(k=>`${JSON.stringify(k)}:${canonicalize(v[k])}`).join(',')}}`}
