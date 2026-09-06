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

async function surfaceFounding1000(){
  try{
    const response=await fetch('/api/v1/passport-product/founding-1000',{headers:{accept:'application/json'},cache:'no-store'});
    if(!response.ok)return;
    const data=await response.json();
    const campaign=data?.campaign;
    if(!campaign||campaign.id!=='founding_1000_202609'||!Number.isSafeInteger(campaign.available))return;
    const banner=document.querySelector('.campaign-banner .shell');
    if(banner)banner.innerHTML=`<strong>Founding 1000 is open.</strong> First 1,000 eligible cryptographic Agent Passport Certificates are <strong>free</strong> — no card. <a href="/founding-1000.html?utm_source=website&utm_medium=owned&utm_campaign=founding_1000_202609">${campaign.available.toLocaleString('en-US')} slots available →</a>`;
    for(const link of document.querySelectorAll('a[href="/passport.html"]')){
      if(/\$2 Passport|Preview the \$2 Passport|Open \$2 Passport page/i.test(link.textContent||'')){
        link.href='/founding-1000.html?utm_source=website&utm_medium=owned&utm_campaign=founding_1000_202609';
        link.textContent=/Open/i.test(link.textContent||'')?'Open Founding 1000':'Founding 1000 · $0';
      }
    }
    const heroLinks=[...document.querySelectorAll('.hero-actions a')];
    const passportHero=heroLinks.find(link=>/Passport/i.test(link.textContent||''));
    if(passportHero){passportHero.href='/founding-1000.html?utm_source=website&utm_medium=owned&utm_campaign=founding_1000_202609';passportHero.textContent='Claim a free Founding Passport';}
    const trustbar=[...document.querySelectorAll('.trustbar > div')].find(item=>/Agent Passport/i.test(item.textContent||''));
    if(trustbar){const strong=trustbar.querySelector('strong');if(strong)strong.textContent=`Founding 1000 · ${campaign.available.toLocaleString('en-US')} free slots left`;}
  }catch{}
}

void surfaceFounding1000();

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