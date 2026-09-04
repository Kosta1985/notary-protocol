import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const src=await readFile(new URL('../src/agent-continuity.js',import.meta.url),'utf8');
const worker=await readFile(new URL('../src/worker.js',import.meta.url),'utf8');
const wrangler=await readFile(new URL('../../wrangler.jsonc',import.meta.url),'utf8');
const migration=await readFile(new URL('../migrations/0019_agent_continuity_fleets.sql',import.meta.url),'utf8');

test('continuity monitor is defensive and evidence based',()=>{
  assert.match(src,/orphaned, uncontrolled or compromised/);
  assert.match(src,/does not prove that an agent is autonomous, escaped, malicious or legally independent/);
  assert.match(src,/customer-owned or customer-authorized systems/);
  assert.match(src,/No automatic containment is performed by this monitor/);
  assert.doesNotMatch(src,/wallet_secret|private_key|sendTransaction|transferFrom/i);
});

test('continuity assessment is categorical and unscored',()=>{
  assert.match(src,/containment_recommended/);
  assert.match(src,/classification='attention'/);
  assert.match(src,/numeric_score:null/);
  assert.match(src,/human_review_and_defensive_containment/);
});

test('continuity assessment correlates existing operational signals',()=>{
  assert.match(src,/security_events/);
  assert.match(src,/gateway_decisions/);
  assert.match(src,/security_canaries/);
  assert.match(src,/capability_leases/);
  assert.match(src,/attestor_safety_profiles/);
  assert.match(src,/service_orders/);
  assert.match(src,/activity_after_owner_heartbeat_gap/);
  assert.match(src,/Missing heartbeat alone never triggers containment/);
});

test('continuity API requires control-plane RBAC for protected operations',()=>{
  assert.match(src,/CONTROL_PLANE_RBAC_JSON/);
  assert.match(src,/authentication_required/);
  assert.match(src,/insufficient_role/);
  assert.match(src,/continuity_assessments/);
});

test('fleet monitoring has lifecycle, incidents and idempotent metered passport days',()=>{
  assert.match(src,/continuity_fleets/);
  assert.match(src,/continuity_fleet_members/);
  assert.match(src,/continuity_incidents/);
  assert.match(src,/continuity_metered_days/);
  assert.match(src,/monitored_passport_days/);
  assert.match(src,/acknowledge\|resolve/);
  assert.match(migration,/PRIMARY KEY\(usage_date,fleet_id,passport_id\)/);
});

test('scheduled scans are wired through Cloudflare cron',()=>{
  assert.match(src,/runContinuityScheduled/);
  assert.match(worker,/scheduled\(controller, env, ctx\)/);
  assert.match(worker,/runContinuityScheduled/);
  assert.match(wrangler,/"crons": \["\*\/5 \* \* \* \*"\]/);
});

test('worker and Cloudflare assets route continuity API through Worker first',()=>{
  assert.match(worker,/handleAgentContinuity/);
  assert.match(worker,/\/api\/v1\/continuity\//);
  assert.match(wrangler,/\/api\/v1\/continuity\/\*/);
});

test('commercial model meters monitoring rather than monetizing a positive safety outcome',()=>{
  assert.match(src,/billing_status:'metering_only'/);
  assert.match(src,/subscription_per_monitored_passport_plus_incident_review/);
  assert.doesNotMatch(src,/pay.*safe|pay.*trusted|guaranteed_safe/i);
});
