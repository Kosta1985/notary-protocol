import { authorizationRequestPayload, leaseStatusPayload } from "./gateway.js";
const SENSITIVE_HEADERS = new Set(["authorization","proxy-authorization","cookie","x-api-key","x-auth-token"]);
export function createProtectedFetch(options) {
  const fetchImpl = options.fetchImpl ?? fetch;
  const maxDecisionAgeMs = clampDecisionAge(options.maxDecisionAgeMs);
  const failMode = options.failMode ?? "closed";
  return async function protectedFetch(input, init) {
    const request = new Request(input, init);
    if (request.url.startsWith(options.accordTraceBaseUrl.replace(/\/$/, "") + "/")) throw new EnforcementError("recursive_accordtrace_request", "Protected fetch must not proxy AccordTrace itself");
    const target = new URL(request.url);
    if (target.protocol !== "https:") throw new EnforcementError("https_required", "Protected requests must use HTTPS");
    rejectSensitiveAgentHeaders(request.headers);
    const action = httpAction(request.method, target), targetOrigin = target.origin, requestId = randomId("enf");
    let decision;
    try { decision = await authorizeFresh(options,{kind:"http",action,targetOrigin,requestId,fetchImpl,maxDecisionAgeMs}); }
    catch(error){ await safeHook(options.hooks?.onError,{kind:"http",action,target_origin:targetOrigin,lease_id:options.leaseId,request_id:requestId,code:errorCode(error)}); if(failMode==="open"&&!options.credentialBroker)return fetchImpl(request); throw error; }
    if(!decision.allowed)throw new EnforcementError("authorization_denied",`AccordTrace denied request: ${decision.reason}`);
    await assertLeaseStillActive(options,fetchImpl);
    const brokered=options.credentialBroker?await options.credentialBroker({action,target_origin:targetOrigin,lease_id:options.leaseId,request_id:requestId}):{};
    const headers=new Headers(request.headers);
    for(const [name,value] of Object.entries(brokered)){if(!isSensitiveHeader(name))throw new EnforcementError("broker_header_not_sensitive","Credential broker may inject only sensitive credential headers");headers.set(name,value)}
    const response=await fetchImpl(new Request(request,{headers}));
    await safeHook(options.hooks?.onExecuted,{kind:"http",action,target_origin:targetOrigin,lease_id:options.leaseId,request_id:requestId,outcome:"executed"});
    return response;
  };
}
export function createProtectedMcpCallTool(options,callTool){
  const fetchImpl=options.fetchImpl??fetch,maxDecisionAgeMs=clampDecisionAge(options.maxDecisionAgeMs),serverOrigin=normalizeHttpsOrigin(options.serverOrigin),serverId=normalizeSegment(options.serverId);
  return async(name,args)=>{const tool=normalizeSegment(name),action=`mcp:${serverId}:${tool}`,requestId=randomId("mcp");let decision;try{decision=await authorizeFresh(options,{kind:"mcp",action,targetOrigin:serverOrigin,requestId,fetchImpl,maxDecisionAgeMs})}catch(error){await safeHook(options.hooks?.onError,{kind:"mcp",action,target_origin:serverOrigin,lease_id:options.leaseId,request_id:requestId,code:errorCode(error)});if(options.failMode==="open"&&!options.credentialBroker)return callTool(name,args);throw error}if(!decision.allowed)throw new EnforcementError("authorization_denied",`AccordTrace denied MCP tool call: ${decision.reason}`);await assertLeaseStillActive(options,fetchImpl);const result=await callTool(name,args);await safeHook(options.hooks?.onExecuted,{kind:"mcp",action,target_origin:serverOrigin,lease_id:options.leaseId,request_id:requestId,outcome:"executed"});return result};
}
async function authorizeFresh(options,context){const observedAt=new Date().toISOString(),payload=authorizationRequestPayload({request_id:context.requestId,lease_id:options.leaseId,subject_passport_id:options.signer.passportId,action:context.action,target_origin:context.targetOrigin,observed_at:observedAt}),signature=await options.signer.sign(payload),response=await context.fetchImpl(`${options.accordTraceBaseUrl.replace(/\/$/,"")}/api/v1/gateway/authorize`,{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({...payloadWithoutDomain(payload),signature})}),result=await parseJson(response);if(!response.ok)throw new EnforcementError("gateway_unavailable",result.message??`Gateway request failed (${response.status})`);const decision=result.decision;if(!decision||typeof decision.allowed!=="boolean"||typeof decision.decided_at!=="string")throw new EnforcementError("invalid_gateway_decision","Gateway returned an invalid decision");const age=Date.now()-Date.parse(decision.decided_at);if(!Number.isFinite(age)||age< -5000||age>context.maxDecisionAgeMs)throw new EnforcementError("stale_gateway_decision","Gateway decision is too old or invalid");await safeHook(options.hooks?.onDecision,{kind:context.kind,action:context.action,target_origin:context.targetOrigin,lease_id:options.leaseId,allowed:decision.allowed,reason:String(decision.reason??"unknown"),request_id:context.requestId});return{allowed:decision.allowed,reason:String(decision.reason??"unknown")}}
async function assertLeaseStillActive(options,fetchImpl){const checkedAt=new Date().toISOString(),payload=leaseStatusPayload({lease_id:options.leaseId,passport_id:options.signer.passportId,checked_at:checkedAt}),signature=await options.signer.sign(payload),response=await fetchImpl(`${options.accordTraceBaseUrl.replace(/\/$/,"")}/api/v1/gateway/leases/status`,{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({...payloadWithoutDomain(payload),signature})}),result=await parseJson(response);if(!response.ok)throw new EnforcementError("lease_status_failed",result.message??`Lease status failed (${response.status})`);const lease=result.lease;if(!lease||lease.status!=="active")throw new EnforcementError("lease_not_active","Lease was revoked or is inactive");const expiry=Date.parse(String(lease.expires_at??""));if(!Number.isFinite(expiry)||expiry<=Date.now())throw new EnforcementError("lease_expired","Lease has expired")}
function rejectSensitiveAgentHeaders(headers){for(const name of headers.keys())if(isSensitiveHeader(name))throw new EnforcementError("agent_supplied_credential",`Agent supplied protected credential header: ${name}`)}
function isSensitiveHeader(name){return SENSITIVE_HEADERS.has(name.toLowerCase())}
function httpAction(method,url){const resource=url.pathname.split("/").filter(Boolean).slice(0,2).map(normalizeSegment).join(":")||"root";return`http:${method.toLowerCase()}:${normalizeSegment(url.hostname)}:${resource}`}
function normalizeSegment(value){const out=value.trim().toLowerCase().replace(/[^a-z0-9._-]+/g,"-").replace(/^-+|-+$/g,"").slice(0,60);if(!out)throw new EnforcementError("invalid_identifier","Identifier cannot be normalized safely");return out}
function normalizeHttpsOrigin(value){const url=new URL(value);if(url.protocol!=="https:"||url.username||url.password)throw new EnforcementError("https_required","MCP server origin must be HTTPS");return url.origin}
function payloadWithoutDomain(payload){const{domain:_domain,...rest}=payload;return rest}
function randomId(prefix){return`${prefix}_${crypto.randomUUID()}`}
function clampDecisionAge(value){return Math.max(250,Math.min(10000,Math.round(value??2000)))}
function errorCode(error){return error instanceof EnforcementError?error.code:"enforcement_error"}
async function parseJson(response){try{return await response.json()}catch{return{}}}
async function safeHook(hook,event){if(!hook)return;try{await hook(event)}catch{}}
export class EnforcementError extends Error{constructor(code,message){super(message);this.code=code}}
