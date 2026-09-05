import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const workflows = {
  secondaryA2A: fs.readFileSync(new URL('../.github/workflows/secondary-a2a-submit.yml', import.meta.url), 'utf8'),
  moltbookRegister: fs.readFileSync(new URL('../.github/workflows/register-moltbook.yml', import.meta.url), 'utf8'),
  moltbookIntroduction: fs.readFileSync(new URL('../.github/workflows/moltbook-introduction.yml', import.meta.url), 'utf8'),
  cloudflareAudit: fs.readFileSync(new URL('../.github/workflows/cloudflare-audit.yml', import.meta.url), 'utf8')
};

function assertManualOnly(source) {
  assert.match(source, /workflow_dispatch:/);
  assert.doesNotMatch(source, /\npush:\s*\n/);
  assert.doesNotMatch(source, /\nschedule:\s*\n/);
}

test('external side-effect workflows are manual-only', () => {
  for (const [name, source] of Object.entries(workflows)) {
    assertManualOnly(source);
    assert.match(source, /permissions:\s*\n\s*contents: read/);
    assert.ok(!source.includes('contents: write'), `${name} must not receive contents: write`);
  }
});

test('Moltbook registration requires explicit confirmation', () => {
  assert.match(workflows.moltbookRegister, /confirm_register/);
  assert.match(workflows.moltbookRegister, /inputs\.confirm_register == 'REGISTER'/);
  assert.match(workflows.moltbookRegister, /A new external registration requires workflow_dispatch plus the exact REGISTER confirmation/);
});

test('Moltbook publishing requires explicit confirmation and cleans transport material', () => {
  assert.match(workflows.moltbookIntroduction, /confirm_publish/);
  assert.match(workflows.moltbookIntroduction, /inputs\.confirm_publish == 'PUBLISH'/);
  assert.match(workflows.moltbookIntroduction, /Cleanup sensitive transport material/);
  assert.match(workflows.moltbookIntroduction, /rm -f \/tmp\/token\.txt/);
});

test('Cloudflare inventory audit requires explicit confirmation and cleans transport material', () => {
  assert.match(workflows.cloudflareAudit, /confirm_audit/);
  assert.match(workflows.cloudflareAudit, /inputs\.confirm_audit == 'AUDIT'/);
  assert.match(workflows.cloudflareAudit, /Cleanup sensitive transport material/);
  assert.match(workflows.cloudflareAudit, /read-only audit requires workflow_dispatch plus the exact AUDIT confirmation/);
});

test('secondary A2A submission remains manual and exact-card verified', () => {
  assert.match(workflows.secondaryA2A, /search=Accord%20Trace/);
  assert.match(workflows.secondaryA2A, /Verified exact Accord Trace listing with canonical Agent Card URI/);
  assert.match(workflows.secondaryA2A, /Repeated unsolicited submissions are intentionally not automated/);
});
