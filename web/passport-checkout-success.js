const statusEl=document.getElementById('order-status');
const resultEl=document.getElementById('order-result');
const params=new URLSearchParams(location.search);
const orderId=params.get('order_id')||'';

if(!/^atpo_[a-f0-9]{32}$/.test(orderId)){
  statusEl.textContent='No valid Passport Certificate order ID was supplied.';
}else{
  loadOrder();
}

async function loadOrder(){
  try{
    const response=await fetch(`/api/v1/passport-product/orders/${encodeURIComponent(orderId)}`,{headers:{accept:'application/json'},cache:'no-store'});
    const body=await response.json().catch(()=>({}));
    if(!response.ok)throw new Error(body.error||`HTTP ${response.status}`);
    const order=body.order||{};
    const status=String(order.payment_status||'unknown');
    statusEl.textContent=`Server-confirmed order state: ${status}`;
    if(status==='fulfilled'&&body.certificate){
      resultEl.innerHTML=`<article class="card"><span class="tag">Fulfilled</span><h3>Portable Certificate issued</h3><p>Certificate <strong>${esc(body.certificate.id)}</strong> was issued after the verified payment event.</p><p><a class="btn" href="${esc(body.certificate.url)}">Open signed Certificate</a></p><p class="muted">Certificate issuance does not imply legal identity, KYC, Trust, safety or a positive validation outcome.</p></article>`;
      return;
    }
    if(status==='review'){
      resultEl.innerHTML='<article class="card"><span class="tag">Review</span><h3>Payment needs review</h3><p>The payment event did not match the configured product economics or otherwise requires review. No referral commission is inferred from this state.</p></article>';
      return;
    }
    if(status==='refunded'||status==='chargeback'){
      resultEl.innerHTML=`<article class="card"><span class="tag">${esc(status)}</span><h3>Commercial state changed</h3><p>The historical Certificate, if one was issued, remains evidence of prior issuance, while the current commercial state is reported separately.</p></article>`;
      return;
    }
    if(status==='failed'){
      resultEl.innerHTML='<article class="card"><span class="tag">Failed</span><h3>Payment was not completed</h3><p>No Certificate fulfillment or referral commission is created from a failed order.</p></article>';
      return;
    }
    resultEl.innerHTML='<article class="card"><span class="tag">Pending</span><h3>Waiting for verified settlement</h3><p>The Stripe return page is not payment truth. Refresh after the verified webhook updates this order.</p><button class="btn" id="refresh-order" type="button">Refresh verified state</button></article>';
    document.getElementById('refresh-order')?.addEventListener('click',loadOrder,{once:true});
  }catch(error){
    statusEl.textContent=`Order state is temporarily unavailable (${error.message}).`;
    resultEl.textContent='Do not infer payment, fulfillment or commission from the browser redirect.';
  }
}

function esc(value){return String(value??'').replace(/[&<>'"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]))}
