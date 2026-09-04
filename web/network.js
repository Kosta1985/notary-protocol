const box=document.getElementById('referral-box');
const codeEl=document.getElementById('referral-code');
const statusEl=document.getElementById('referral-status');
const copyBtn=document.getElementById('copy-referral');
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
    codeEl.textContent=body.referral?.code||code;
    statusEl.className='status ok';
    statusEl.textContent='Direct referral recognized. Keep this code for the Passport attribution flow.';
    copyBtn.hidden=false;
    copyBtn.dataset.code=body.referral?.code||code;
  }catch(error){
    statusEl.className='status bad';
    statusEl.textContent=`Referral is not currently active (${error.message}). Do not infer an affiliate relationship from this URL.`;
  }
}

copyBtn?.addEventListener('click',async()=>{
  const code=copyBtn.dataset.code;
  if(!code)return;
  try{await navigator.clipboard.writeText(code);copyBtn.textContent='Copied referral code';}
  catch{copyBtn.textContent=code;}
});
