const box=document.getElementById('referral-box');
const codeEl=document.getElementById('referral-code');
const statusEl=document.getElementById('referral-status');
const copyBtn=document.getElementById('copy-referral');
const buyBtn=document.getElementById('buy-with-ref');
const ref=new URLSearchParams(location.search).get('ref');

if(ref){
  box.hidden=false;
  if(!/^atr_[a-f0-9]{16}$/i.test(ref)){
    statusEl.textContent='This referral code is not in a valid AccordTrace format.';
    statusEl.className='status bad';
  }else{
    resolveReferral(ref.toLowerCase());
  }
}

async function resolveReferral(code){
  statusEl.textContent='Checking direct referral…';
  try{
    const response=await fetch(`/api/v1/network/referrals/${encodeURIComponent(code)}`,{headers:{accept:'application/json'}});
    const body=await response.json().catch(()=>({}));
    if(!response.ok)throw new Error(body.error||`HTTP ${response.status}`);
    const activeCode=body.referral?.code||code;
    codeEl.textContent=activeCode;
    statusEl.className='status ok';
    statusEl.textContent='Direct referral recognized. A qualifying US$2 Agent Passport Certificate purchase can create the direct referrer’s US$1 commission after verified settlement and review.';
    copyBtn.hidden=false;
    copyBtn.dataset.code=activeCode;
    if(buyBtn){
      buyBtn.hidden=false;
      buyBtn.href=`/passport.html?ref=${encodeURIComponent(activeCode)}`;
    }
  }catch(error){
    statusEl.className='status bad';
    statusEl.textContent=`Referral is not currently active (${error.message}). Do not infer an affiliate relationship from this URL.`;
    if(buyBtn)buyBtn.hidden=true;
  }
}

copyBtn?.addEventListener('click',async()=>{
  const code=copyBtn.dataset.code;
  if(!code)return;
  try{await navigator.clipboard.writeText(code);copyBtn.textContent='Copied referral code';}
  catch{copyBtn.textContent=code;}
});
