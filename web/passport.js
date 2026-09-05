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
  return new Intl.NumberFormat('en-US',{style:'currency',currency:String(currency).toUpperCase(),minimumFractionDigits:2}).format(Number(atomic||0)/100);
}

async function get(path){
  const response=await fetch(path,{headers:{accept:'application/json'}});
  let body={};
  try{body=await response.json();}catch{}
  if(!response.ok)throw new Error(body.error||body.message||`HTTP ${response.status}`);
  return body;
}

async function loadPolicy(){
  try{
    const [product,network]=await Promise.all([
      get('/api/v1/passport-product/capabilities'),
      get('/api/v1/network/capabilities')
    ]);
    const priceAtomic=product.product?.price?.amount_atomic??network.passport_price?.amount_atomic??200;
    const currency=product.product?.price?.currency??network.passport_price?.currency??'usd';
    const commissionAtomic=network.direct_commission?.amount_atomic??100;
    priceEl.textContent=money(priceAtomic,currency);
    commissionEl.textContent=money(commissionAtomic,network.direct_commission?.currency??currency);
    payoutEl.textContent=network.cash_payouts_enabled?'Enabled':'Not yet enabled';

    if(product.commercial_ready){
      statusEl.textContent='Stripe checkout + verified webhook + signing are production-ready.';
      checkoutCopy.textContent=`Stripe checkout is live. An active Agent Passport signs the dedicated checkout request; only the verified Stripe webhook can fulfill the ${money(priceAtomic,currency)} Certificate.`;
      buyButton.classList.remove('disabled');
      buyButton.removeAttribute('aria-disabled');
      buyButton.textContent=`Start ${money(priceAtomic,currency)} agent checkout`;
    }else{
      const missing=Object.entries(product.readiness||{}).filter(([,value])=>!value).map(([key])=>key.replaceAll('_',' '));
      statusEl.textContent='Product policy is live; commercial checkout is waiting on production payment/signing gates.';
      checkoutCopy.textContent=`The product price is ${money(priceAtomic,currency)}. Checkout stays fail-closed until Stripe and certificate-signing gates are all active${missing.length?`: ${missing.join(', ')}`:''}.`;
      buyButton.classList.add('disabled');
      buyButton.setAttribute('aria-disabled','true');
      buyButton.textContent='Stripe activation in progress';
    }
  }catch(error){
    statusEl.textContent='Product policy temporarily unavailable.';
    checkoutCopy.textContent=`Live readiness check failed (${error.message}). No payment availability is inferred from this page.`;
    buyButton.classList.add('disabled');
    buyButton.setAttribute('aria-disabled','true');
    buyButton.textContent='Checkout readiness unavailable';
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
    referralDetail.textContent='Active direct referral. A qualifying $2 Certificate purchase can create the referrer’s $1 direct commission after verified settlement and review.';
    referralBox.classList.add('ok');
  }catch(error){
    referralDetail.textContent=`Referral is not currently active (${error.message}). Do not infer attribution from the URL.`;
    referralBox.classList.add('bad');
  }
}

buyButton?.addEventListener('click',event=>{
  if(buyButton.getAttribute('aria-disabled')==='true')event.preventDefault();
});

loadPolicy();
loadReferral();
