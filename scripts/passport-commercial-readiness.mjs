const DEFAULT_BASE='https://accordtrace.notary-labs.workers.dev';
const base=(process.argv[2]||DEFAULT_BASE).replace(/\/$/,'');
const url=`${base}/api/v1/passport-product/capabilities`;

const response=await fetch(url,{headers:{'accept':'application/json','x-accordtrace-telemetry':'exclude'}});
if(!response.ok){
  console.error(JSON.stringify({status:'error',http_status:response.status,url},null,2));
  process.exit(1);
}

const body=await response.json();
const hardFailures=[];
const expected={amount_atomic:200,currency:'usd'};

if(body?.product?.id!=='agent_passport_certificate')hardFailures.push('unexpected_product_id');
if(body?.product?.price?.amount_atomic!==expected.amount_atomic)hardFailures.push('unexpected_price_amount');
if(body?.product?.price?.currency!==expected.currency)hardFailures.push('unexpected_price_currency');
if(body?.referral_pricing_consistent!==true)hardFailures.push('referral_pricing_inconsistent');
if(body?.cash_affiliate_payouts_enabled!==false)hardFailures.push('cash_affiliate_payouts_must_remain_disabled');

const gates={
  checkout_enabled:body?.checkout_enabled===true,
  webhook_enabled:body?.webhook_enabled===true,
  certificate_signing_enabled:body?.certificate_signing_enabled===true,
  commercial_ready:body?.commercial_ready===true
};

const result={
  status:hardFailures.length?'policy_drift':(gates.commercial_ready?'commercial_ready':'activation_pending'),
  service:body?.service||null,
  product:{id:body?.product?.id||null,price:body?.product?.price||null},
  gates,
  cash_affiliate_payouts_enabled:body?.cash_affiliate_payouts_enabled,
  referral_pricing_consistent:body?.referral_pricing_consistent,
  hard_failures:hardFailures,
  checked_url:url,
  checked_at:new Date().toISOString(),
  note:gates.commercial_ready
    ? 'Commercial readiness is live. This probe did not create a Checkout Session or charge a payment method.'
    : 'Activation is still fail-closed. This probe did not create a Checkout Session or charge a payment method.'
};

console.log(JSON.stringify(result,null,2));
if(hardFailures.length)process.exit(1);
