import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import test from 'node:test';

const run = (eventName, event) => spawnSync(process.execPath,
  ['native-ios/scripts/ci-test-profile.mjs'], {
    encoding: 'utf8',
    env: { ...process.env, GITHUB_EVENT_NAME: eventName },
    input: typeof event === 'string' ? event : JSON.stringify(event),
  });

test('ordinary PRs and protected-branch pushes select light scope without simulator shards', () => {
  for (const [name, event] of [
    ['pull_request', { pull_request: { base: { ref: 'dev' } } }],
    ['pull_request', { pull_request: { base: { ref: 'main' } } }],
    ['push', { ref: 'refs/heads/dev' }],
    ['push', { ref: 'refs/heads/main' }],
  ]) {
    const result = run(name, event);
    assert.equal(result.status, 0, result.stderr);
    assert.equal(result.stdout, 'test-scope=light\n');
  }
});

test('manual dispatch defaults to full and accepts an explicit light scope', () => {
  for (const event of [{}, { inputs: { test_scope: 'full' } }]) {
    const result = run('workflow_dispatch', event);
    assert.equal(result.status, 0, result.stderr);
    assert.equal(result.stdout, 'test-scope=full\n');
  }
  const result = run('workflow_dispatch', { inputs: { test_scope: 'light' } });
  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.stdout, 'test-scope=light\n');
});

test('unknown events, branches, malformed JSON and arbitrary scope values fail without outputs', () => {
  for (const [name, event] of [
    ['merge_group', {}], ['schedule', {}],
    ['push', { ref: 'refs/heads/codex/feature' }],
    ['pull_request', { pull_request: { base: { ref: 'other' } } }],
    ['workflow_dispatch', { inputs: { test_scope: 'unknown' } }],
    ['workflow_dispatch', { inputs: { test_scope: 'fast' } }],
    ['workflow_dispatch', { inputs: { test_scope: 'fast\nmatrix={"shard":[]}' } }],
    ['workflow_dispatch', { inputs: { test_scope: ['fast'] } }],
    ['workflow_dispatch', { inputs: { test_scope: null } }],
    ['workflow_dispatch', { inputs: 'fast' }],
    ['workflow_dispatch', 'not json'], ['workflow_dispatch', 'null'],
  ]) {
    const result = run(name, event);
    assert.notEqual(result.status, 0);
    assert.equal(result.stdout, '');
  }
});
