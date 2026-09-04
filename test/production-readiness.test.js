import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';
const ready=fs.readFileSync(new URL('../scripts/production-readiness.mjs',import.meta.url),'utf8');
const smoke=fs.readFileSync(new URL('../scripts/full-production-smoke.js',import.meta.url),'utf8');
const deploy=fs.readFileSync(new URL('../.github/workflows/deploy-accordtrace.yml',import.meta.url),'utf8');
const launch=fs.readFileSync(new URL('../cloudflare/src/launch.js',import.meta.url),'utf8');
test('readiness validator requires contiguous migrations and commercial assets',()=>{assert.match(ready,/migration_sequence/);assert.match(ready,/web\/verify\.html/);assert.match(ready,/expected_at_least_16/);});
test('production smoke covers commercial and trust surfaces',()=>{for(const marker of ['/api/v1/security/capabilities','/api/v1/payments/capabilities','/api/v1/validation/capabilities','/api/v1/reputation/capabilities','/api/v1/launch/capabilities'])assert.match(smoke,new RegExp(marker.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')));});
test('deploy stamps and verifies the exact release SHA',()=>{assert.match(deploy,/ACCORDTRACE_RELEASE_SHA/);assert.match(deploy,/EXPECTED_RELEASE_SHA/);assert.match(deploy,/smoke:production/);assert.match(launch,/release_sha/);});
test('deploy applies migrations before worker deployment',()=>{assert.ok(deploy.indexOf('d1 migrations apply')<deploy.indexOf('wrangler@latest deploy'));});
