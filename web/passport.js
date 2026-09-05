const statusEl=document.getElementById('product-status');
const priceEl=document.getElementById('live-price');
const commissionEl=document.getElementById('live-commission');
const payoutEl=document.getElementById('payout-status');
const checkoutCopy=document.getElementById('checkout-copy');
const buyButton=document.getElementById('buy-button');
const referralBox=document.getElementById('referral-detected');
const referralValue=document.getElementById('referral-value');
const referralDetail=document.getElementById('referral-detail');
const params=new URLSearchParams(location.search);
const ref=String(params.get('ref')||'').trim().toLowerCase();

function money(atomic,currency='usd'){
  return new Intl.NumberFormat('en-US',{style:'currency',currency:String(currency).toUpperCase(),minimumFractionDigits:2}).format(Number(atomic)/100);
}

async function get(path){
  const controller=new AbortController();
  const timer=setTimeout(()=>controller.abort(),10000);
  try{
    const response=await fetch(path,{headers:{accept:'application/json'},signal:controller.signal,cache:'no-store'});
    if(!response.ok)throw new Error(`HTTP ${response.status}`);
    const body=await response.json();
    if(!body||typeof body!=='object'||Array.isArray(body))throw new Error('Invalid policy response');
    return body;
  }finally{clearTimeout(timer);}
}

function disableCheckout(label){
  buyButton.classList.add('disabled');
  buyButton.setAttribute('aria-disabled','true');
  buyButton.textContent=label;
}

async function loadPolicy(){
  // Referral display is optional. Its outage must not masquerade as a payment outage.
  const [productResult,networkResult]=await Promise.allSettled([
    get('/api/v1/passport-product/capabilities'),
    get('/api/v1/network/capabilities')
  ]);
  if(networkResult.status==='fulfilled'){
    const network=networkResult.value;
    try{
      if(!Number.isSafeInteger(network.direct_commission?.amount_atomic)||network.direct_commission.amount_atomic<0)throw new Error('Invalid commission');
      commissionEl.textContent=money(network.direct_commission.amount_atomic,network.direct_commission.currency||'usd');
    }catch{commissionEl.textContent='Unavailable';}
    payoutEl.textContent=network.cash_payouts_enabled===true?'Enabled':network.cash_payouts_enabled===false?'Not yet enabled':'Unknown';
  }else{
    commissionEl.textContent='Unavailable';
    payoutEl.textContent='Unknown';
  }

  try{
    if(productResult.status!=='fulfilled')throw new Error('Product policy unavailable');
    const product=productResult.value;
    const priceAtomic=product.product?.price?.amount_atomic;
    const currency=product.product?.price?.currency;
    if(product.product?.id!=='agent_passport_certificate'||!Number.isSafeInteger(priceAtomic)||priceAtomic<=0||typeof currency!=='string'||!/^[a-z]{3}$/i.test(currency))throw new Error('Invalid product policy');
    const price=money(priceAtomic,currency);
    priceEl.textContent=price;
    // The capabilities API exposes these booleans, not a `readiness` object.
    const gates=[
      ['Stripe checkout configuration',product.checkout_enabled],
      ['Stripe webhook configuration',product.webhook_enabled],
      ['certificate signing',product.certificate_signing_enabled],
      ['referral pricing consistency',product.referral_pricing_consistent]
    ];
    const missing=gates.filter(([,value])=>value!==true).map(([label])=>label);
    if(product.commercial_ready===true&&missing.length===0){
      statusEl.textContent='Checkout prerequisites are configured. Signed-agent checkout is available.';
      checkoutCopy.textContent=`Open the ${price} checkout instructions for an active Agent Passport. Only a verified Stripe webhook can fulfill the Certificate; configuration alone does not confirm a completed payment.`;
      buyButton.classList.remove('disabled');
      buyButton.removeAttribute('aria-disabled');
      buyButton.textContent=`Open ${price} checkout instructions`;
    }else{
      if(missing.length===0)missing.push('commercial activation');
      statusEl.textContent=`Checkout unavailable: ${missing.join(', ')}.`;
      checkoutCopy.textContent=`The Certificate price is ${price}. Payments remain disabled until ${missing.join(', ')} is ready. No Certificate purchase is initiated from this page while checkout is disabled.`;
      disableCheckout(product.certificate_signing_enabled!==true?'Certificate signing not ready':'Checkout activation pending');
    }
  }catch{
    statusEl.textContent='Product policy temporarily unavailable.';
    checkoutCopy.textContent='The live readiness check could not be confirmed. Checkout remains disabled; no payment availability is inferred from this page.';
    disableCheckout('Checkout readiness unavailable');
  }
}

async function loadReferral(){
  if(!ref)return;
  referralBox.hidden=false;
  referralValue.textContent=ref;
  if(!/^atr_[a-f0-9]{16}$/.test(ref)){
    referralDetail.textContent='Invalid AccordTrace referral-code format. No attribution is inferred.';
    referralBox.classList.add('bad');
    return;
  }
  try{
    const data=await get(`/api/v1/network/referrals/${encodeURIComponent(ref)}`);
    const code=data.referral?.code||ref;
    referralValue.textContent=code;
    referralDetail.textContent='Active direct referral. A qualifying $2 Certificate purchase can create the referrer\'s $1 direct commission after verified settlement and review.';
    referralBox.classList.add('ok');
  }catch{
    referralDetail.textContent='Referral availability could not be confirmed. Do not infer attribution from the URL.';
    referralBox.classList.add('bad');
  }
}

buyButton?.addEventListener('click',event=>{
  if(buyButton.getAttribute('aria-disabled')==='true')event.preventDefault();
});

loadPolicy();
loadReferral();
