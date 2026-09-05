import { readJsonBody, InputError } from './http-request.js';
import { handleStripe, StripeError } from './stripe.js';
const JSON_HEADERS={"content-type":"application/json; charset=utf-8"};
const INTERESTS=new Set(['agent_verification','validator','developer','business','enterprise']);
export async function handleLaunch(request,env,url=new URL(request.url)){
  if(!url.pathname.startsWith('/api/v1/launch/'))return null;
  if(url.pathname.startsWith('/api/v1/launch/stripe/')){try{return await handleStripe(request,env,url)}catch(error){const status=error instanceof StripeError?error.status:500;return reply({error:error instanceof StripeError?'invalid_stripe_request':'internal_error',message:error instanceof Error?error.message:'Unknown error'},status)}}
  if(request.method==='GET'&&url.pathname==='/api/v1/launch/capabilities')return reply({service:'AccordTrace Launch',version:'0.3.0',features:['privacy_bounded_waitlist','commercial_readiness','release_drift_detection','stripe_checkout_adapter'],stripe_enabled:Boolean(env.STRIPE_SECRET_KEY)&&Boolean(env.STRIPE_WEBHOOK_SECRET),payments_mode:env.STRIPE_SECRET_KEY&&env.STRIPE_WEBHOOK_SECRET?'stripe_ready':'prelaunch',release_sha:env.ACCORDTRACE_RELEASE_SHA||null});
  if(request.method==='POST'&&url.pathname==='/api/v1/launch/waitlist'){
    let b;
    try { b = await readJsonBody(request, { maxBytes: 16_384, maxDepth: 8, maxNodes: 64 }); }
    catch (error) { if (error instanceof InputError) return reply({error:'invalid_waitlist_request',message:error.message},error.status); throw error; }
    for (const field of ['email','interest','source','website']) {
      if (b[field] !== undefined && typeof b[field] !== 'string') return reply({error:'invalid_waitlist_field'},400);
    }
    if(String(b.website||'').trim())return reply({accepted:true});
    const email=String(b.email||'').trim().toLowerCase();
    if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)||email.length>254)return reply({error:'invalid_email'},400);
    const interest=INTERESTS.has(String(b.interest||''))?String(b.interest):'agent_verification';
    const source=String(b.source||'website').trim().slice(0,80)||'website';
    const now=new Date().toISOString(); const id=`wl_${await sha256Hex(email).then(x=>x.slice(0,24))}`;
    await env.DB.prepare(`INSERT INTO launch_waitlist (id,email,interest,source,status,created_at,updated_at) VALUES (?1,?2,?3,?4,'waiting',?5,?5) ON CONFLICT(email) DO UPDATE SET interest=excluded.interest,source=excluded.source,updated_at=excluded.updated_at WHERE launch_waitlist.status<>'unsubscribed'`).bind(id,email,interest,source,now).run();
    return reply({accepted:true,status:'received',message:'Your early-access request has been received. Existing unsubscribe preferences are preserved.'},201);
  }
  return reply({error:'not_found'},404);
}
async function sha256Hex(v){const d=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(v));return[...new Uint8Array(d)].map(x=>x.toString(16).padStart(2,'0')).join('')}
function reply(body,status=200){return new Response(JSON.stringify(body),{status,headers:JSON_HEADERS})}
