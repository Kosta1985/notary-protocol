/** Reproducible planning scenarios, not a price change, tax return or provider quote. */
import path from 'node:path';
import { fileURLToPath } from 'node:url';
export const R2_TARIFF = Object.freeze({currency:'USD',effective_date:'2026-09-05',verified_at:'2026-09-06',valid_until:'2026-10-06',
  source:'https://developers.cloudflare.com/r2/pricing/',units:'GB-month / million operations',
  storage:0.015,class_a:4.5,class_b:0.36,free_storage:10,free_a:1000000,free_b:10000000});
const nonnegative=(n)=>{if(!Number.isFinite(n)||n<0)throw new RangeError('Expected a finite nonnegative number');return n;};
const ratio=(n)=>{nonnegative(n);if(n>1)throw new RangeError('Expected a ratio from 0 to 1');return n;};
const round=n=>Math.round((n+Number.EPSILON)*100)/100;
export function scenario({seats,operators=seats,price=9,gstRate=0.1,cardRate=0.035,cardFixed=0.30,billingRate=0.007,
  refundRate=0.03,infrastructure=0.5,supportMinutes=2,supportHourly=45,fixed=2000,churn=0.05,cac=30,newOperators=0}={}) {
  for(const n of [seats,operators,price,cardFixed,infrastructure,supportMinutes,supportHourly,fixed,cac,newOperators])nonnegative(n);
  for(const n of [gstRate,cardRate,billingRate,refundRate,churn])ratio(n);
  if(!Number.isSafeInteger(seats)||!Number.isSafeInteger(operators)||operators>seats||!Number.isSafeInteger(newOperators)||(seats>0&&operators===0))throw new RangeError('Invalid seat/operator counts');
  const gross=seats*price,net=gross/(1+gstRate),payments=seats*(price*cardRate+cardFixed),billing=gross*billingRate;
  const reserves=gross*refundRate,infra=seats*infrastructure,support=seats*supportMinutes/60*supportHourly;
  const contribution=net-payments-billing-reserves-infra-support,replacement=operators*churn*cac,newAcquisition=newOperators*cac;
  return {currency:'AUD',seats,operators,assumptions_only:true,gross_collections:round(gross),gst:round(gross-net),net_sales:round(net),
    stripe_payments:round(payments),stripe_billing:round(billing),refund_dispute_reserve:round(reserves),infrastructure_allowance:round(infra),
    support_labor:round(support),contribution:round(contribution),contribution_per_seat:seats?contribution/seats:null,fixed_costs:round(fixed),
    churn_replacement_cac:round(replacement),new_customer_acquisition:round(newAcquisition),initial_base_acquisition_one_off:round(operators*cac),
    result_before_founder_development_income_tax:round(contribution-fixed-replacement-newAcquisition),founder_development_income_tax_included:false};
}
export function r2Incremental({existing={storage:0,class_a:0,class_b:0},added={storage:0,class_a:0,class_b:0},usdAud=1.6,
  taxMultiplier=1,asOf='2026-09-06',tariff=R2_TARIFF}={}) {
  const time=Date.parse(asOf),valid=Date.parse(tariff.valid_until),effective=Date.parse(tariff.effective_date),verified=Date.parse(tariff.verified_at);
  if(![time,valid,effective,verified].every(Number.isFinite)||time<effective||time<verified||time>valid||tariff.currency!=='USD')throw new RangeError('Tariff not usable on that date');
  nonnegative(usdAud);nonnegative(taxMultiplier);if(usdAud===0||taxMultiplier<1)throw new RangeError('Invalid FX or tax multiplier');
  for(const key of ['storage','class_a','class_b']) {nonnegative(existing[key]);nonnegative(added[key]);nonnegative(tariff[key]);}
  for(const key of ['free_storage','free_a','free_b'])nonnegative(tariff[key]);
  const bill=u=>Math.ceil(Math.max(0,u.storage-tariff.free_storage))*tariff.storage+
    Math.ceil(Math.max(0,u.class_a-tariff.free_a)/1e6)*tariff.class_a+Math.ceil(Math.max(0,u.class_b-tariff.free_b)/1e6)*tariff.class_b;
  const combined=Object.fromEntries(Object.keys(existing).map(k=>[k,existing[k]+added[k]]));
  const baseline=bill(existing),total=bill(combined);
  return {currency:'AUD',fx_is_assumption:true,usd_aud:usdAud,account_baseline_usd:baseline,account_total_usd:total,
    incremental_usd:total-baseline,incremental_aud:(total-baseline)*usdAud*taxMultiplier,
    excludes:['Workers','D1','Queues','backup','KMS','CI','support','provider minimums outside R2','taxes outside supplied multiplier']};
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url))console.log(JSON.stringify({
  scenarios:[0,100,500,1000,5000].map(seats=>scenario({seats,fixed:seats===5000?10000:2000})),
  support_stress:scenario({seats:1000,supportMinutes:10,infrastructure:1.5}),
  r2_example:r2Incremental({added:{storage:200,class_a:300000,class_b:1000000}}),
  source_assumptions:'User master brief sections 8.8-8.11; no commercial activation.'},null,2));
