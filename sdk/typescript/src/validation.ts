export type ValidationType='domain_control'|'security_assessment'|'publisher_validation';
export type ValidationOutcome='passed'|'failed'|'inconclusive';

export interface ValidationRequestInput {request_id:string;product_id:string;subject_passport_id:string;validator_passport_id:string;validation_type:ValidationType;payment_order_id:string;subject_ref:string;requested_at:string;}
export interface ValidationResultInput {request_id:string;product_id:string;subject_passport_id:string;validator_passport_id:string;validation_type:ValidationType;outcome:ValidationOutcome;evidence_digest:string|null;completed_at:string;expires_at:string|null;}
export interface ValidationProductInput {product_id:string;validator_passport_id:string;validation_type:ValidationType;title:string;description?:string|null;payment_offer_id:string;validity_days:number;issued_at:string;}

export function validationProductPayload(input:ValidationProductInput):Record<string,unknown>{return{domain:'accordtrace.validation.product.v1',product_id:cleanId(input.product_id),validator_passport_id:cleanId(input.validator_passport_id),validation_type:input.validation_type,title:text(input.title,120),description:input.description?text(input.description,500):null,payment_offer_id:cleanId(input.payment_offer_id),validity_days:boundedInt(input.validity_days,1,365),issued_at:new Date(input.issued_at).toISOString()};}
export function validationRequestPayload(input:ValidationRequestInput):Record<string,unknown>{return{domain:'accordtrace.validation.request.v1',request_id:cleanId(input.request_id),product_id:cleanId(input.product_id),subject_passport_id:cleanId(input.subject_passport_id),validator_passport_id:cleanId(input.validator_passport_id),validation_type:input.validation_type,payment_order_id:cleanId(input.payment_order_id),subject_ref:input.validation_type==='domain_control'?normalizeDomain(input.subject_ref):text(input.subject_ref,500),requested_at:new Date(input.requested_at).toISOString()};}
export function validationResultPayload(input:ValidationResultInput):Record<string,unknown>{const evidence=input.evidence_digest?cleanDigest(input.evidence_digest):null;if(input.outcome==='passed'&&!evidence)throw new TypeError('Passed validation requires evidence_digest');return{domain:'accordtrace.validation.result.v1',request_id:cleanId(input.request_id),product_id:cleanId(input.product_id),subject_passport_id:cleanId(input.subject_passport_id),validator_passport_id:cleanId(input.validator_passport_id),validation_type:input.validation_type,outcome:input.outcome,evidence_digest:evidence,completed_at:new Date(input.completed_at).toISOString(),expires_at:input.expires_at?new Date(input.expires_at).toISOString():null};}

export class ValidationClient{
  private readonly baseUrl:string;
  constructor(baseUrl:string){this.baseUrl=baseUrl.replace(/\/$/,'');}
  capabilities(){return this.request('/api/v1/validation/capabilities');}
  products(type?:ValidationType){return this.request(`/api/v1/validation/products${type?`?type=${encodeURIComponent(type)}`:''}`);}
  stats(){return this.request('/api/v1/validation/stats');}
  createProduct(input:ValidationProductInput&{signature:string}){return this.request('/api/v1/validation/products',input);}
  createRequest(input:{request_id:string;product_id:string;subject_passport_id:string;payment_order_id:string;subject_ref:string;requested_at:string;signature:string}){return this.request('/api/v1/validation/requests',input);}
  submitResult(input:{request_id:string;validator_passport_id:string;outcome:ValidationOutcome;evidence_digest?:string|null;completed_at:string;signature:string}){return this.request('/api/v1/validation/results',input);}
  createDomainChallenge(input:{request_id:string;subject_passport_id:string}){return this.request('/api/v1/validation/domain/challenges',input);}
  verifyDomain(input:{request_id:string;challenge_token:string}){return this.request('/api/v1/validation/domain/verify',input);}
  getRequest(id:string){return this.request(`/api/v1/validation/requests/${encodeURIComponent(id)}`);}
  evidence(passportId:string){return this.request(`/api/v1/validation/passports/${encodeURIComponent(passportId)}/evidence`);}
  private async request(path:string,body?:unknown):Promise<Record<string,unknown>>{const response=await fetch(`${this.baseUrl}${path}`,body===undefined?undefined:{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(body)});const result=await response.json() as Record<string,unknown>&{message?:string;error?:string};if(!response.ok)throw new Error(result.message??result.error??`AccordTrace validation request failed (${response.status})`);return result;}
}

function cleanId(v:string){const s=v.trim();if(!/^[A-Za-z0-9][A-Za-z0-9._:-]{0,199}$/.test(s))throw new TypeError('Invalid identifier');return s;}
function cleanDigest(v:string){const s=v.trim().toLowerCase();if(!/^[a-f0-9]{64}$/.test(s))throw new TypeError('Digest must be SHA-256 hex');return s;}
function normalizeDomain(v:string){const s=v.toLowerCase().replace(/^https?:\/\//,'').split('/')[0].replace(/\.$/,'');if(!/^(?=.{1,253}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/.test(s))throw new TypeError('Invalid domain');return s;}
function boundedInt(v:number,min:number,max:number){const n=Math.trunc(Number(v));if(!Number.isFinite(n)||n<min||n>max)throw new TypeError('Integer out of range');return n;}
function text(v:string,n:number){const s=String(v??'').trim().slice(0,n);if(!s)throw new TypeError('Text required');return s;}
