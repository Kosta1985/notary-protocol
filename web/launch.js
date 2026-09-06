import { requestJson, publicErrorMessage } from './public-evidence.js';
const form=document.querySelector('#interest-form');
const status=document.querySelector('#interest-status');
let submitting=false,controller=null;
const clean=(value,fallback)=>{const v=String(value||'').trim().toLowerCase();return /^[a-z0-9][a-z0-9_-]{0,63}$/.test(v)?v:fallback};
const params=new URLSearchParams(location.search);
const attribution={
  campaign:clean(params.get('utm_campaign')||document.body.dataset.campaign,'public_beta_202609'),
  channel:clean(params.get('utm_source')||document.body.dataset.channel,'direct'),
  medium:clean(params.get('utm_medium')||document.body.dataset.medium,'owned')
};
const source=String(document.body.dataset.source||'homepage').slice(0,80);
const record=event=>requestJson('/api/v1/launch/campaign-event',{body:{...attribution,event},timeoutMs:3000}).catch(()=>null);
if(document.body.dataset.trackCampaign==='true')queueMicrotask(()=>record('landing_view'));
document.addEventListener('click',event=>{const target=event.target.closest('[data-campaign-event]');if(target)void record(target.dataset.campaignEvent)});
form?.addEventListener('submit',async event=>{
  event.preventDefault();if(submitting)return;
  submitting=true;controller=new AbortController();
  const button=form.querySelector('button[type="submit"]');
  if(button)button.disabled=true;form.setAttribute('aria-busy','true');
  status.className='status';status.textContent='Joining...';
  const payload={email:document.querySelector('#interest-email').value,interest:document.querySelector('#interest-type').value,website:document.querySelector('#website').value,source,...attribution};
  try{
    const result=await requestJson('/api/v1/launch/waitlist',{body:payload,signal:controller.signal});
    if(result.accepted!==true)throw new Error('Unexpected waitlist response');
    status.className='status ok';status.textContent='Your early-access request has been received. Existing unsubscribe preferences are preserved.';form.reset();
  }catch(error){
    status.className='status bad';
    status.textContent=error.status===400?'Enter a valid email address and try again.':error.code==='timeout'||error.code==='network'?'We could not confirm receipt of your request. Please retry; duplicate email submissions do not create another entry.':publicErrorMessage(error);
  }finally{
    submitting=false;controller=null;if(button)button.disabled=false;form.setAttribute('aria-busy','false');
  }
});
window.addEventListener('pagehide',()=>controller?.abort());
