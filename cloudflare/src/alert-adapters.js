const SUPPORTED_TYPES=new Set(['webhook','slack_webhook','email_relay']);

export function prepareAlertDelivery(config,event){
  const cfg=config&&typeof config==='object'?config:{};
  const type=String(cfg.type||'webhook');
  if(!SUPPORTED_TYPES.has(type))return{error:'unsupported_adapter',type};
  if(!isHttpsUrl(cfg.url))return{error:'url_must_be_https',type};
  const safe=sanitizeAlertEvent(event);
  const headers={'content-type':'application/json'};
  if(cfg.bearer_token)headers.authorization=`Bearer ${String(cfg.bearer_token)}`;
  let payload=safe;
  if(type==='slack_webhook')payload=slackPayload(safe);
  if(type==='email_relay'){
    const to=bounded(cfg.to||cfg.recipient,254);
    if(!to)return{error:'email_recipient_required',type};
    payload=emailRelayPayload(to,safe);
  }
  return{type,url:String(cfg.url),headers,body:JSON.stringify(payload)};
}

export function sanitizeAlertEvent(event){
  const e=event&&typeof event==='object'?event:{};
  return{
    kind:bounded(e.kind,80)||'control_plane_event',
    severity:severity(e.severity),
    target_type:bounded(e.target_type,80)||null,
    target_ref:bounded(e.target_ref,200)||null,
    event_digest:hexDigest(e.event_digest),
    occurred_at:validIso(e.occurred_at)?new Date(e.occurred_at).toISOString():new Date().toISOString(),
    message:bounded(e.message,300)||null,
    source:'AccordTrace Control Plane',
    contains_secrets:false
  };
}

function slackPayload(event){
  const target=event.target_ref?` · ${event.target_ref}`:'';
  const message=event.message?` · ${event.message}`:'';
  return{
    text:`[AccordTrace ${event.severity.toUpperCase()}] ${event.kind}${target}${message}`.slice(0,3000),
    accordtrace_event:{...event}
  };
}

function emailRelayPayload(to,event){
  const target=event.target_ref?` · ${event.target_ref}`:'';
  return{
    to,
    subject:`[AccordTrace ${event.severity.toUpperCase()}] ${event.kind}`.slice(0,180),
    text:`AccordTrace control-plane alert\nSeverity: ${event.severity}\nKind: ${event.kind}${target}\nEvent digest: ${event.event_digest||'not supplied'}\nOccurred at: ${event.occurred_at}${event.message?`\nMessage: ${event.message}`:''}`.slice(0,5000),
    event:{...event}
  };
}

function isHttpsUrl(value){
  try{const u=new URL(String(value||''));return u.protocol==='https:'&&!u.username&&!u.password;}
  catch{return false;}
}
function bounded(value,max){return String(value??'').trim().slice(0,max);}
function severity(value){const v=String(value||'info');return['info','low','medium','high','critical'].includes(v)?v:'info';}
function hexDigest(value){const v=String(value||'').trim();return/^[a-f0-9]{64}$/i.test(v)?v.toLowerCase():null;}
function validIso(value){return Number.isFinite(Date.parse(value));}
