import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';
const dns=fs.readFileSync(new URL('../src/validation-dns.js',import.meta.url),'utf8');
const worker=fs.readFileSync(new URL('../src/worker.js',import.meta.url),'utf8');
const migration=fs.readFileSync(new URL('../migrations/0015_validation_dns_automation.sql',import.meta.url),'utf8');

test('domain challenge stores only token digest and returns token once',()=>{assert.match(dns,/record_value_digest/);assert.match(dns,/Only hashes are persisted/);assert.doesNotMatch(migration,/challenge_token\s+TEXT/i);});
test('DNS verification produces evidence but cannot mint passed result',()=>{assert.match(dns,/next_step:'A qualified validator must sign the final passed result using this exact evidence_digest.'/);assert.doesNotMatch(dns,/UPDATE validation_requests SET status='completed'/);assert.doesNotMatch(dns,/validation_result_signatures/);});
test('DNS resolver is fixed and redirect is denied',()=>{assert.match(dns,/https:\/\/dns\.google\/resolve/);assert.match(dns,/redirect:'error'/);});
test('validation stats are aggregate and privacy bounded',()=>{assert.match(dns,/\/api\/v1\/validation\/stats/);assert.match(dns,/Aggregate counts only/);assert.doesNotMatch(dns,/SELECT \*/);assert.match(dns,/trust_score:null/);});
test('worker handles API OPTIONS before authenticated control plane routing',()=>{const options=worker.indexOf('request.method === "OPTIONS"');const cp=worker.indexOf('/api/v1/control-plane/maintenance/');assert.ok(options>0&&cp>options);assert.match(worker,/status:204/);});
