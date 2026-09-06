const remainingEl=document.getElementById('founding-remaining');
const issuedEl=document.getElementById('founding-issued');
const reservedEl=document.getElementById('founding-reserved');
const statusEl=document.getElementById('founding-status');
const progressEl=document.getElementById('founding-progress-bar');

async function loadFounding1000(){
  const controller=new AbortController();
  const timer=setTimeout(()=>controller.abort(),10000);
  try{
    const response=await fetch('/api/v1/passport-product/founding-1000',{headers:{accept:'application/json'},cache:'no-store',signal:controller.signal});
    if(!response.ok)throw new Error(`HTTP ${response.status}`);
    const data=await response.json();
    const campaign=data?.campaign;
    if(!campaign||campaign.id!=='founding_1000_202609')throw new Error('Unexpected campaign');
    for(const key of ['limit','issued','reserved','available'])if(!Number.isSafeInteger(campaign[key])||campaign[key]<0)throw new Error(`Invalid ${key}`);
    if(campaign.limit!==1000||campaign.issued+campaign.reserved+campaign.available!==campaign.limit)throw new Error('Invalid campaign totals');
    remainingEl.textContent=campaign.available.toLocaleString('en-US');
    issuedEl.textContent=campaign.issued.toLocaleString('en-US');
    reservedEl.textContent=campaign.reserved.toLocaleString('en-US');
    const consumed=campaign.issued+campaign.reserved;
    progressEl.style.width=`${Math.min(100,Math.max(0,consumed/campaign.limit*100))}%`;
    if(data.claim_enabled===true){
      statusEl.textContent=campaign.available>0?'Claims open':'Founding cohort full';
    }else if(campaign.available===0){
      statusEl.textContent='Founding cohort full';
    }else if(data.campaign_enabled===false){
      statusEl.textContent='Campaign temporarily paused';
    }else{
      statusEl.textContent='Certificate signer not ready';
    }
  }catch{
    remainingEl.textContent='—';
    issuedEl.textContent='—';
    reservedEl.textContent='—';
    statusEl.textContent='Live availability temporarily unavailable';
    progressEl.style.width='0%';
  }finally{clearTimeout(timer);}
}

loadFounding1000();
