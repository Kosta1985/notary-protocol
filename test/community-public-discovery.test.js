import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { loadCommunityEvidence, complaintSummaryTotal } from '../web/community-evidence.js';

const passport='agtp_'+'a'.repeat(64);
const json=value=>new Response(JSON.stringify(value),{status:200,headers:{'content-type':'application/json'}});

test('community evidence loader accepts bounded private membership and complaint summaries',async()=>{
  const fetchImpl=async path=>{
    if(String(path).endsWith('/membership'))return json({passport_id:passport,membership:{tier:'resident',state:'active',granted_at:'2026-09-06T00:00:00.000Z',updated_at:'2026-09-06T00:00:00.000Z'},legal_status_effect:false,trust_effect:false});
    if(String(path).endsWith('/complaints-summary'))return json({passport_id:passport,complaints:[{state:'submitted',count:2},{state:'dismissed',count:1}],meaning:'Counts are allegations/review outcomes, not a Trust Score or proof of misconduct.',automatic_trust_effect:false});
    throw new Error('unexpected path');
  };
  const result=await loadCommunityEvidence(passport,{fetchImpl});
  assert.equal(result.membership.membership.tier,'resident');
  assert.equal(complaintSummaryTotal(result.complaints_summary),3);
  assert.deepEqual(result.warnings,[]);
});

test('community evidence loader rejects legal or trust effect escalation',async()=>{
  const fetchImpl=async path=>{
    if(String(path).endsWith('/membership'))return json({passport_id:passport,membership:{tier:'citizen',state:'active'},legal_status_effect:true,trust_effect:false});
    if(String(path).endsWith('/complaints-summary'))return json({passport_id:passport,complaints:[],automatic_trust_effect:true});
    throw new Error('unexpected path');
  };
  const result=await loadCommunityEvidence(passport,{fetchImpl});
  assert.equal(result.membership,null);
  assert.equal(result.complaints_summary,null);
  assert.equal(result.warnings.length,2);
});

test('Agent Passport UI keeps membership and complaint records out of Trust claims',()=>{
  const source=fs.readFileSync('web/agents.js','utf8');
  assert.match(source,/private AccordTrace label has no legal-status or Trust effect/i);
  assert.match(source,/not proof of misconduct, a Trust Score, or automatic enforcement/i);
  assert.match(source,/Do not infer zero complaints or misconduct/i);
  assert.match(source,/loadCommunityEvidence/);
});
