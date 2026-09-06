import { requestJson, publicErrorMessage, EvidenceError } from './public-evidence.js';

const object=value=>Boolean(value&&typeof value==='object'&&!Array.isArray(value));
const TIERS=new Set(['passport_holder','resident','citizen']);
const MEMBERSHIP_STATES=new Set(['active','suspended','relinquished']);
const COMPLAINT_STATES=new Set(['submitted','reviewing','dismissed','upheld','closed']);

export async function loadCommunityEvidence(passportId,options={}){
  if(!/^agtp_[a-f0-9]{64}$/.test(String(passportId||'')))throw new EvidenceError('invalid_passport');
  const endpoints=[
    ['membership',`/api/v1/community/passports/${passportId}/membership`],
    ['complaints_summary',`/api/v1/community/passports/${passportId}/complaints-summary`]
  ];
  const result={membership:null,complaints_summary:null,warnings:[]};
  await Promise.all(endpoints.map(async([name,path])=>{
    try{
      const value=await requestJson(path,{...options,optional:true});
      if(value&&value.passport_id!==passportId)throw new EvidenceError('invalid_response');
      if(value&&name==='membership')validateMembership(value);
      if(value&&name==='complaints_summary')validateComplaints(value);
      result[name]=value;
    }catch(error){
      result[name]=null;
      result.warnings.push({section:name,message:publicErrorMessage(error)});
    }
  }));
  if(options.signal?.aborted)throw new EvidenceError('cancelled');
  return result;
}

function validateMembership(value){
  if(!object(value.membership)||!TIERS.has(value.membership.tier)||!MEMBERSHIP_STATES.has(value.membership.state))throw new EvidenceError('invalid_response');
  if(value.legal_status_effect!==false||value.trust_effect!==false)throw new EvidenceError('invalid_response');
}

function validateComplaints(value){
  if(!Array.isArray(value.complaints)||value.complaints.some(row=>!object(row)||!COMPLAINT_STATES.has(row.state)||!Number.isSafeInteger(row.count)||row.count<0))throw new EvidenceError('invalid_response');
  if(value.automatic_trust_effect!==false)throw new EvidenceError('invalid_response');
}

export function complaintSummaryTotal(value){
  if(!value||!Array.isArray(value.complaints))return null;
  let total=0;
  for(const row of value.complaints){
    if(!Number.isSafeInteger(row.count)||row.count<0||!Number.isSafeInteger(total+row.count))return null;
    total+=row.count;
  }
  return total;
}
