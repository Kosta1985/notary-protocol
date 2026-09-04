import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';
const guard=fs.readFileSync(new URL('../src/gateway-payment-guard.js',import.meta.url),'utf8');
const smoke=fs.readFileSync(new URL('../../scripts/payments-smoke.js',import.meta.url),'utf8');

test('payment-bound gateway fails closed when payment schema is missing',()=>{assert.match(guard,/payment_schema_unavailable/);assert.match(guard,/Apply AccordTrace payment migrations/);assert.match(guard,/return json\([\s\S]*503\)/);});
test('missing schema detection is scoped to service_orders',()=>{assert.match(guard,/isMissingTable\(error, "service_orders"\)/);assert.match(guard,/no such table/);});
test('payments smoke is read-only except invalid empty verify probe',()=>{assert.match(smoke,/\/api\/v1\/payments\/capabilities/);assert.match(smoke,/\/api\/v1\/payments\/x402\/verify/);assert.match(smoke,/Empty x402 verify must fail closed/);assert.doesNotMatch(smoke,/\/settle/);assert.doesNotMatch(smoke,/sendTransaction|transferFrom/);});
test('payments smoke requires hardened features and non-custody',()=>{for(const feature of ['deterministic_payment_requirements','payment_payload_replay_protection','facilitator_supported_preflight'])assert.match(smoke,new RegExp(feature));assert.match(smoke,/custody!=='none'/);});
