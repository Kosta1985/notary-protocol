import { readJsonBody, InputError } from './http-request.js';
import { handleStripe, StripeError } from './stripe.js';
const JSON_HEADERS={"content-type":"application/json; charset=utf-8"};
const INTERESTS=new Set(['agent_verification','validator','developer','business','enterprise']);
const CAMPAIGN_EVENTS=new Set(['landing_view','start_click','developer_click','waitlist_submit']);
const ATTR_PATTERN=/^[a-z0-9][a-z0-9_-]{0,63}$/;

export async function handleLaunch(request,env,url=new URL(request.url)){
  if(!url.pathname.startsWith('/api/v1/launch/'))return null;
  if(url.pathname.startsWith('/api/v1/launch/stripe/')){try{return await handleStripe(request,env,url)}catch(error){const status=error instanceof StripeError?error.status:500;return reply({error:error instanceof StripeError?'invalid_stripe_request':'internal_error',message:error instanceof Error?error.message:'Unknown error'},status)}}
  if(request.method==='GET'&&url.pathname==='/api/v1/launch/capabilities')return reply({service:'AccordTrace Launch',version:'0.4.0',features:['privacy_bounded_waitlist','campaign_attribution','aggregate_campaign_stats','commercial_readiness','release_drift_detection','stripe_checkout_adapter'],stripe_enabled:Boolean(env.STRIPE_SECRET_KEY)&&Boolean(env.STRIPE_WEBHOOK_SECRET),payments_mode:env.STRIPE_SECRET_KEY&&env.STRIPE_WEBHOOK_SECRET?'stripe_ready':'prelaunch',release_sha:env.ACCORDTRACE_RELEASE_SHA||null});

  if(request.method==='POST'&&url.pathname==='/api/v1/launch/campaign-event'){
    let b;
    try{b=await readJsonBody(request,{maxBytes:4096,maxDepth:6,maxNodes:32});}
    catch(error){if(error instanceof InputError)return reply({error:'invalid_campaign_event',message:error.message},error.status);throw error;}
    const event=String(b.event||'');if(!CAMPAIGN_EVENTS.has(event))return reply({error:'campaign_event_invalid'},400);
    const campaign=attribute(b.campaign,'campaign','public_beta_202609');
    const channel=attribute(b.channel,'channel','direct');
    const medium=attribute(b.medium,'medium','owned');
    await recordCampaignEvent(env,{campaign,channel,medium,event});
    return reply({accepted:true,aggregate_only:true,unique_visitor_claim:false},202);
  }

  if(request.method==='GET'&&url.pathname==='/api/v1/launch/stats'){
    const campaign=url.searchParams.get('campaign');
    const filter=campaign?attribute(campaign,'campaign'):null;
    const eventRows=filter
      ?await env.DB.prepare(`SELECT day,campaign,channel,medium,event,count FROM campaign_daily WHERE campaign=?1 ORDER BY day DESC,channel,medium,event`).bind(filter).all()
      :await env.DB.prepare(`SELECT day,campaign,channel,medium,event,count FROM campaign_daily ORDER BY day DESC,campaign,channel,medium,event LIMIT 500`).all();
    const waitlistRows=filter
      ?await env.DB.prepare(`SELECT campaign,channel,medium,interest,status,COUNT(*) AS count FROM launch_waitlist WHERE campaign=?1 GROUP BY campaign,channel,medium,interest,status ORDER BY count DESC`).bind(filter).all()
      :await env.DB.prepare(`SELECT campaign,channel,medium,interest,status,COUNT(*) AS count FROM launch_waitlist WHERE campaign IS NOT NULL GROUP BY campaign,channel,medium,interest,status ORDER BY count DESC LIMIT 250`).all();
    return reply({campaign:filter,events:eventRows.results||[],waitlist:waitlistRows.results||[],measurement_boundary:'Campaign event counts are aggregate interactions, not unique humans or agents. Waitlist counts represent stored email submissions subject to unsubscribe preservation. No IP address or user-agent is stored by this campaign layer.'});
  }

  if(request.method==='POST'&&url.pathname==='/api/v1/launch/waitlist'){
    let b;
    try { b = await readJsonBody(request, { maxBytes: 16_384, maxDepth: 8, maxNodes: 64 }); }
    catch (error) { if (error instanceof InputError) return reply({error:'invalid_waitlist_request',message:error.message},error.status); throw error; }
    for (const field of ['email','interest','source','website','campaign','channel','medium']) {
      if (b[field] !== undefined && typeof b[field] !== 'string') return reply({error:'invalid_waitlist_field'},400);
    }
    if(String(b.website||'').trim())return reply({accepted:true});
    const email=String(b.email||'').trim().toLowerCase();
    if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)||email.length>254)return reply({error:'invalid_email'},400);
    const interest=INTERESTS.has(String(b.interest||''))?String(b.interest):'agent_verification';
    const source=String(b.source||'website').trim().slice(0,80)||'website';
    const campaign=attribute(b.campaign,'campaign','public_beta_202609');
    const channel=attribute(b.channel,'channel','direct');
    const medium=attribute(b.medium,'medium','owned');
    const now=new Date().toISOString(); const id=`wl_${await sha256Hex(email).then(x=>x.slice(0,24))}`;
    await env.DB.prepare(`INSERT INTO launch_waitlist (id,email,interest,source,status,created_at,updated_at,campaign,channel,medium) VALUES (?1,?2,?3,?4,'waiting',?5,?5,?6,?7,?8) ON CONFLICT(email) DO UPDATE SET interest=excluded.interest,source=excluded.source,campaign=excluded.campaign,channel=excluded.channel,medium=excluded.medium,updated_at=excluded.updated_at WHERE launch_waitlist.status<>'unsubscribed'`).bind(id,email,interest,source,now,campaign,channel,medium).run();
    await recordCampaignEvent(env,{campaign,channel,medium,event:'waitlist_submit'});
    return reply({accepted:true,status:'received',message:'Your early-access request has been received. Existing unsubscribe preferences are preserved.'},201);
  }
  return reply({error:'not_found'},404);
}

function attribute(value,name,fallback=null){
  const normalized=String(value??'').trim().toLowerCase();
  if(!normalized){if(fallback!==null)return fallback;throw new InputError(`${name} is required`,400);}
  if(!ATTR_PATTERN.test(normalized))throw new InputError(`${name} must use lowercase letters, numbers, hyphen or underscore`,400);
  return normalized;
}
async function recordCampaignEvent(env,{campaign,channel,medium,event}){try{await env.DB.prepare(`INSERT INTO campaign_daily(day,campaign,channel,medium,event,count) VALUES(date('now'),?1,?2,?3,?4,1) ON CONFLICT(day,campaign,channel,medium,event) DO UPDATE SET count=count+1`).bind(campaign,channel,medium,event).run();return true}catch{return false}}
async function sha256Hex(v){const d=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(v));return[...new Uint8Array(d)].map(x=>x.toString(16).padStart(2,'0')).join('')}
function reply(body,status=200){return new Response(JSON.stringify(body),{status,headers:JSON_HEADERS})}
