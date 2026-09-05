import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const launch=fs.readFileSync(new URL('../src/launch.js',import.meta.url),'utf8');
const migration=fs.readFileSync(new URL('../migrations/0016_launch_waitlist.sql',import.meta.url),'utf8');
const worker=fs.readFileSync(new URL('../src/worker.js',import.meta.url),'utf8');
const home=fs.readFileSync(new URL('../../web/index.html',import.meta.url),'utf8');
const passport=fs.readFileSync(new URL('../../web/passport.html',import.meta.url),'utf8');
const passportJs=fs.readFileSync(new URL('../../web/passport.js',import.meta.url),'utf8');
const network=fs.readFileSync(new URL('../../web/network.html',import.meta.url),'utf8');
const verify=fs.readFileSync(new URL('../../web/verify.html',import.meta.url),'utf8');
const dash=fs.readFileSync(new URL('../../web/dashboard.html',import.meta.url),'utf8');

test('commercial homepage leads with the standalone US$2 Passport product and US$1 direct referral',()=>{
  assert.match(home,/Agent Passport Certificate/i);
  assert.match(home,/US\$2/i);
  assert.match(home,/US\$1/i);
  assert.match(home,/\/passport\.html/);
  assert.match(home,/\/network\.html/);
  assert.doesNotMatch(home,/TaskBay's portable evidence layer/);
});

test('Passport launch page provides a clearly marked sample and precise evidence scope',()=>{
  assert.match(passport,/Sample Agent Passport Certificate/i);
  assert.match(passport,/>SAMPLE</);
  assert.match(passport,/agent_passport_certificate/);
  assert.match(passport,/Ed25519/);
  assert.match(passport,/not legal identity, KYC/i);
  assert.match(passport,/US\$2\.00/);
});

test('commercial UI remains fail-closed until live Stripe and signing gates are ready',()=>{
  assert.match(home,/checkout remains fail-closed/i);
  assert.match(home,/\/api\/v1\/passport-product\/capabilities/);
  // Keep the source contract aligned with the behavioral false/string/missing-gate tests.
  assert.match(passportJs,/if\(product\.commercial_ready===true&&missing\.length===0\)/);
  assert.match(passportJs,/value!==true/);
  assert.match(passportJs,/Certificate signing not ready/);
  assert.match(passportJs,/aria-disabled/);
  assert.doesNotMatch(passportJs,/if\(product\.commercial_ready\)/);
  assert.doesNotMatch(home,/>Pay now</i);
});

test('referral marketing keeps the one-level and payout boundaries explicit',()=>{
  assert.match(network,/US\$1 qualifying commission/i);
  assert.match(network,/One level only/i);
  assert.match(network,/No downline/i);
  assert.match(network,/Cash payout rail is not yet enabled/i);
  assert.match(network,/Invitation generation is not a sale/i);
});

test('waitlist stores bounded lead fields and no network identity',()=>{assert.match(migration,/email TEXT NOT NULL UNIQUE/);assert.doesNotMatch(migration,/ip_address|user_agent|fingerprint/i);assert.doesNotMatch(launch,/CF-Connecting-IP|request\.headers/i);});
test('launch capability reports whether Stripe secret exists without exposing it',()=>{assert.match(launch,/Boolean\(env\.STRIPE_SECRET_KEY\)/);assert.doesNotMatch(launch,/stripe_secret_key\s*:/i);});
test('worker routes launch API and public self-service pages exist',()=>{assert.match(worker,/handleLaunch/);assert.match(verify,/Public verification/);assert.match(dash,/Self-service console/);});
