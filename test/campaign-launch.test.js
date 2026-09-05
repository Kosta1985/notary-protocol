import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { runChallenge } from '../examples/agent-handoff/campaign.mjs';
import { handleProofs } from '../cloudflare/src/proofs.js';
const base='https://campaign-fixture.test';
function fixture(){
 const records=new Map(),calls=[];
 const env={DB:{prepare(sql){return{bind(...args){return{
  async run(){assert.match(sql,/^INSERT INTO receipts/);records.set(args[0],args[4]);return{success:true};},
  async first(){assert.match(sql,/^SELECT receipt FROM receipts/);const receipt=records.get(args[0]);return receipt?{receipt}:null;}
 };}};}}};
 return{env,records,calls,fetchImpl:async(url,init)=>{assert.ok(url.startsWith(base+'/api/v1/'));calls.push(JSON.parse(init.body));return handleProofs(new Request(url,init),env);}};
}
test('campaign creates exactly one synthetic record and checks the original and mutation',async()=>{
 const h=fixture(),r=await runChallenge({base,source:'github',fetchImpl:h.fetchImpl});
 assert.equal(h.records.size,1);assert.equal(h.calls.length,3);assert.equal(h.calls[0].metadata.synthetic,true);assert.equal(r.changed_evidence_rejected,true);assert.equal(r.exact_evidence_verified,true);assert.equal(r.signature_valid,null);assert.match(r.scope,/single-client/);
});
test('campaign verifies issuer signatures with the actual local Worker and a generated key',async()=>{
 const h=fixture(),pair=await crypto.subtle.generateKey({name:'Ed25519'},true,['sign','verify']);h.env.NOTARY_PRIVATE_JWK=JSON.stringify(await crypto.subtle.exportKey('jwk',pair.privateKey));
 const r=await runChallenge({base,fetchImpl:h.fetchImpl});assert.equal(r.integrity_mode,'issuer_signed_hash');assert.equal(r.signature_valid,true);
});
test('campaign fails when changed evidence is incorrectly accepted',async()=>{
 const h=fixture();let n=0;await assert.rejects(runChallenge({base,fetchImpl:async(...args)=>{const r=await h.fetchImpl(...args);if(++n===3)return Response.json({...await r.json(),valid:true,hash_match:true});return r;}}),/incorrectly accepted/);
});
test('campaign rejects a mismatched verification ID',async()=>{
 const h=fixture();let n=0;await assert.rejects(runChallenge({base,fetchImpl:async(...args)=>{const r=await h.fetchImpl(...args);if(++n===2)return Response.json({...await r.json(),proof_id:'atp_'+'a'.repeat(32)});return r;}}));
});
test('campaign rejects unsafe origins before sending requests',async()=>{
 for(const b of ['http://example.test','https://user:pass@example.test','https://example.test/path','https://example.test/?private=1'])await assert.rejects(runChallenge({base:b,fetchImpl:()=>{throw Error('No request allowed');}}),/plain HTTPS/);
});
test('unrecognised source labels do not enter public metadata',async()=>{
 const h=fixture(),r=await runChallenge({base,source:'private@example.test',fetchImpl:h.fetchImpl});assert.equal(r.source,'direct');assert.equal(JSON.stringify(h.calls).includes('private@example.test'),false);
});
test('campaign page has a runnable free entry and explicit paid-launch limitations',()=>{
 const page=fs.readFileSync('web/start.html','utf8');for(const p of [/No account/,/No card/,/one synthetic public proof/,/one-client smoke test/,/Paid Passport checkout is on hold/,/cash referral payouts are not enabled/,/id="try"/])assert.match(page,p);
 assert.doesNotMatch(page,/Pay now|guaranteed income/i);assert.match(fs.readFileSync('README.md','utf8'),/\/start\.html/);
});
