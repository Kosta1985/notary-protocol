import { loadPassportEvidence, requestJson, publicErrorMessage } from './public-evidence.js';
const form=document.querySelector('#passport-form');
const input=document.querySelector('#passport-id');
const result=document.querySelector('#passport-result');
const status=document.querySelector('#service-status');
let controller=null,sequence=0;
form?.addEventListener('submit',async event=>{
  event.preventDefault();controller?.abort();controller=new AbortController();
  const ticket=++sequence,id=input.value.trim();
  result.className='verify-result show';result.textContent='Loading public evidence...';result.setAttribute('aria-busy','true');
  try{
    const data=await loadPassportEvidence(id,{signal:controller.signal});if(ticket!==sequence)return;
    const heading=document.createElement('strong');heading.textContent=id;
    const note=document.createElement('p');note.className='muted';note.textContent=data.warnings.length?'Passport loaded. Some supplementary evidence is unavailable; see warnings below.':'Current public evidence loaded. This is not a new proof of key possession.';
    const pre=document.createElement('pre');pre.className='evidence-json';pre.textContent=JSON.stringify(data,null,2);
    result.replaceChildren(heading,note,pre);
  }catch(error){if(ticket===sequence&&error.code!=='cancelled')result.textContent=publicErrorMessage(error)}
  finally{if(ticket===sequence)result.setAttribute('aria-busy','false')}
});
input?.addEventListener('input',()=>{if(controller){controller.abort();controller=null;sequence++;result.textContent='Reference changed. Load the new Passport to view its evidence.';result.setAttribute('aria-busy','false')}});
const probes=[['/api/v1/security/capabilities','Passport & Security'],['/api/v1/validation/capabilities','Validation Marketplace'],['/api/v1/payments/capabilities','Payments'],['/api/v1/passport-product/capabilities','Passport Certificate']];
Promise.all(probes.map(async([path,name])=>{
  try{
    const body=await requestJson(path);
    return {name,ok:true,detail:path.includes('passport-product')?(body.commercial_ready===true?'Checkout prerequisites configured; this does not confirm a completed payment.':'Certificate purchases are not currently enabled.'):'Public capabilities API responded. This does not imply every operation is enabled.'};
  }catch(error){return{name,ok:false,detail:publicErrorMessage(error)}}
})).then(rows=>{
  if(!status)return;
  status.replaceChildren(...rows.map(row=>{
    const article=document.createElement('article');article.className='card';
    const tag=document.createElement('span');tag.className='tag';tag.textContent=row.ok?'API responding':'Unavailable';
    const heading=document.createElement('h3');heading.textContent=row.name;
    const note=document.createElement('p');note.textContent=row.detail;
    article.append(tag,heading,note);return article;
  }));
});
window.addEventListener('pagehide',()=>controller?.abort());
