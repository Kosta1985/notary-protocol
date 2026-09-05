import { requestJson, publicErrorMessage } from './public-evidence.js';
const box=document.getElementById('referral-box');
const codeEl=document.getElementById('referral-code');
const statusEl=document.getElementById('referral-status');
const copyBtn=document.getElementById('copy-referral');
const buyBtn=document.getElementById('buy-with-ref');
const ref=new URLSearchParams(location.search).get('ref');
if(ref){
  box.hidden=false;
  if(!/^atr_[a-f0-9]{16}$/i.test(ref)){
    statusEl.textContent='This referral code is not in a valid AccordTrace format.';statusEl.className='status bad';
  }else resolveReferral(ref.toLowerCase());
}
async function resolveReferral(code){
  statusEl.textContent='Checking direct referral...';copyBtn.hidden=true;if(buyBtn)buyBtn.hidden=true;
  try{
    const body=await requestJson(`/api/v1/network/referrals/${encodeURIComponent(code)}`);
    if(body.referral?.status!=='active'||body.referral?.code!==code||!/^agtp_[a-f0-9]{64}$/.test(body.referral?.referrer_passport_id||''))throw new Error('Incomplete referral response');
    codeEl.textContent=code;statusEl.className='status ok';
    statusEl.textContent='Direct referral recognized. A qualifying US$2 Agent Passport Certificate purchase can create the direct referrer\'s US$1 commission after verified settlement and review. Cash payouts remain separately controlled.';
    copyBtn.hidden=false;copyBtn.dataset.code=code;
    if(buyBtn){buyBtn.hidden=false;buyBtn.href=`/passport.html?ref=${encodeURIComponent(code)}`}
  }catch(error){
    statusEl.className='status bad';statusEl.textContent=`Referral could not be confirmed. ${publicErrorMessage(error)} Do not infer an affiliate relationship from this URL.`;
    copyBtn.hidden=true;if(buyBtn)buyBtn.hidden=true;
  }
}
copyBtn?.addEventListener('click',async()=>{
  const code=copyBtn.dataset.code;if(!code)return;
  try{await navigator.clipboard.writeText(code);copyBtn.textContent='Copied referral code'}
  catch{copyBtn.textContent=code}
});
