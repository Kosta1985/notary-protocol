import test from 'node:test';
import assert from 'node:assert/strict';
import { createCheckRunner } from '../scripts/check-runner.mjs';

test('check runner keeps executing independent stages and reports every failure', async () => {
  const runner = createCheckRunner();
  await runner.run('healthy', async () => 'ok');
  await runner.run('first-failure', async () => { throw new Error('first problem'); });
  await runner.run('second-failure', async () => { throw new Error('second problem'); });

  assert.equal(runner.ok, false);
  assert.deepEqual(runner.passed, ['healthy']);
  assert.deepEqual(runner.failures, [
    { name: 'first-failure', error: 'first problem' },
    { name: 'second-failure', error: 'second problem' }
  ]);
});

test('check runner skips only stages whose declared dependencies did not pass', async () => {
  const runner = createCheckRunner();
  await runner.run('proof-rest', async () => { throw new Error('proof unavailable'); });
  let dependentExecuted = false;
  await runner.run('a2a-proof', async () => { dependentExecuted = true; }, ['proof-rest']);
  await runner.run('independent-growth', async () => 'still-runs');

  assert.equal(dependentExecuted, false);
  assert.deepEqual(runner.skipped, [{ name: 'a2a-proof', blocked_by: ['proof-rest'] }]);
  assert.ok(runner.passed.includes('independent-growth'));
});
