import { fileURLToPath } from 'node:url';

const defaultBaseUrl='https://accordtrace.notary-labs.workers.dev';
const REQUIRED=['deterministic_payment_requirements','payment_payload_replay_protection','facilitator_supported_preflight'];

export async function runPaymentsSmoke(baseUrl=defaultBaseUrl,fetcher=fetch){
  const base=new URL(baseUrl);
  const health=await fetcher(new URL('/health',base),{headers:{'x-notary-monitor':'payments-smoke'}}); if(!health.ok)throw new Error(`GET /health returned HTTP ${health.status}`);
  const capabilities=await fetcher(new URL('/api/v1/payments/capabilities',base),{headers:{'x-notary-monitor':'payments-smoke'}});
  if(capabilities.status===404)return{status:'ok',mode:'not_deployed_yet',baseUrl:base.origin,requiredFeatures:REQUIRED};
  if(!capabilities.ok)throw new Error(`Payment capabilities returned HTTP ${capabilities.status}`);
  const body=await capabilities.json();
  const missing=REQUIRED.filter(f=>!body?.features?.includes(f)); if(missing.length)throw new Error(`Missing payment hardening features: ${missing.join(', ')}`);
  if(body?.custody!=='none')throw new Error('Payment capability must remain non-custodial');
  const verify=await fetcher(new URL('/api/v1/payments/x402/verify',base),{method:'POST',headers:{'content-type':'application/json','x-notary-monitor':'payments-smoke'},body:JSON.stringify({})});
  if(verify.status<400)throw new Error(`Empty x402 verify must fail closed; got HTTP ${verify.status}`);
  return{status:'ok',mode:'hardened_capabilities_verified',baseUrl:base.origin,features:REQUIRED,custody:body.custody,emptyVerifyStatus:verify.status};
}

if(process.argv[1]&&fileURLToPath(import.meta.url)===process.argv[1])runPaymentsSmoke(process.argv[2]??process.env.ACCORDTRACE_BASE??defaultBaseUrl).then(r=>console.log(JSON.stringify(r,null,2))).catch(e=>{console.error(`Payments smoke failed: ${e.message}`);process.exitCode=1;});
