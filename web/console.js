import { requestJson, publicErrorMessage } from './public-evidence.js';
let token='';
let generation=0,controller=null;
const $=id=>document.getElementById(id);
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
function clearSession(message='Token cleared from memory'){
  generation++;controller?.abort();controller=null;token='';$('token').value='';
  $('summary').replaceChildren();$('incidents').replaceChildren();$('app').classList.add('hidden');
  $('connect').disabled=false;$('refresh').disabled=false;$('status').textContent=message;
}
function errorMessage(error){return [401,403].includes(error.status)?'Access denied. Check the operator token and its permissions.':publicErrorMessage(error)}
async function api(path,signal){return requestJson(path,{signal,headers:{authorization:`Bearer ${token}`}})}
function renderSummary(summary){
  if(!summary||typeof summary!=='object')throw new Error('Invalid summary');
  const items=[['Material security',summary.material_security_events],['Canary touches',summary.canary_touches],['Revoked leases',summary.revoked_leases],['Unsafe attestors',summary.unsafe_attestors],['Gateway denials',summary.gateway_denials],['Payment rejections',summary.payment_rejections]];
  $('summary').innerHTML=items.map(([label,value])=>`<div class="card"><div class="muted">${esc(label)}</div><div class="metric">${Number.isFinite(Number(value))?Number(value):'Unknown'}</div></div>`).join('');
}
async function loadIncidents(signal,ticket){
  const q=new URLSearchParams({limit:'100'});
  if($('type').value)q.set('type',$('type').value);
  if($('passport').value.trim())q.set('passport_id',$('passport').value.trim());
  const data=await api(`/api/v1/control-plane/incidents?${q}`,signal);
  if(ticket!==generation||signal.aborted)return;
  if(!Array.isArray(data.incidents))throw new Error('Invalid incidents');
  $('incidents').innerHTML=data.incidents.length?data.incidents.map(e=>`<div class="incident"><div><strong class="${['high','medium','low'].includes(e.severity)?e.severity:'low'}">${esc(e.kind)}</strong> <span class="muted">${esc(e.occurred_at)}</span></div><div>${e.passport_id?`Passport <code>${esc(e.passport_id)}</code>`:''} ${e.lease_id?` - Lease <code>${esc(e.lease_id)}</code>`:''}</div><div class="muted">${esc(e.reason||e.action||e.state||e.status||'')}</div></div>`).join(''):'<div class="muted">No matching incidents.</div>';
}
async function connect(){
  const entered=$('token').value.trim();
  if(!entered&&!token){$('status').textContent='Enter operator token';return}
  controller?.abort();controller=new AbortController();const {signal}=controller;const ticket=++generation;
  if(entered)token=entered;$('token').value='';$('app').classList.add('hidden');$('connect').disabled=true;$('status').textContent='Loading...';
  try{
    await api('/api/v1/control-plane/capabilities',signal);
    const summary=await api('/api/v1/control-plane/summary',signal);
    if(ticket!==generation||signal.aborted)return;
    renderSummary(summary.summary);await loadIncidents(signal,ticket);
    if(ticket!==generation||signal.aborted)return;
    $('app').classList.remove('hidden');$('status').textContent='Connected';
  }catch(error){if(ticket===generation&&error.code!=='cancelled')clearSession(errorMessage(error))}
  finally{if(ticket===generation)$('connect').disabled=false}
}
$('connect').onclick=connect;
$('refresh').onclick=async()=>{
  if(!token)return;
  controller?.abort();controller=new AbortController();const {signal}=controller;const ticket=++generation;$('refresh').disabled=true;
  try{await loadIncidents(signal,ticket);if(ticket===generation)$('status').textContent='Updated'}
  catch(error){if(ticket===generation&&error.code!=='cancelled'){if([401,403].includes(error.status))clearSession(errorMessage(error));else $('status').textContent=errorMessage(error)}}
  finally{if(ticket===generation)$('refresh').disabled=false}
};
$('clear').onclick=()=>clearSession();
window.addEventListener('pagehide',()=>clearSession());
window.addEventListener('beforeunload',()=>{token='';controller?.abort()});
