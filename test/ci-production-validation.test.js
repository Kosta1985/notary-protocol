import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const ci=fs.readFileSync(new URL('../.github/workflows/ci.yml',import.meta.url),'utf8');
const readiness=fs.readFileSync(new URL('../scripts/production-readiness.mjs',import.meta.url),'utf8');

test('pull-request CI runs the same production source validation as deployment',()=>{
  assert.match(ci,/pull_request:/);
  assert.match(ci,/run: npm run production:check/);
  assert.ok(ci.indexOf('npm test')<ci.indexOf('npm run production:check'));
  assert.ok(ci.indexOf('npm run production:check')<ci.indexOf('npm run cf:prepare'));
});

test('production source readiness requires fail-closed logic rather than obsolete button copy',()=>{
  assert.ok(readiness.includes("'product.commercial_ready===true'"));
  assert.ok(readiness.includes("'missing.length===0'"));
  assert.ok(readiness.includes("'certificate_signing_enabled'"));
  assert.doesNotMatch(readiness,/Stripe activation in progress/);
});
