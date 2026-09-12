import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import test from 'node:test';

const repository = 'example/native-learning';
const run = (base, head, headRepo = repository, eventName = 'pull_request') => spawnSync(
  process.execPath, ['scripts/check-branch-policy.mjs'], {
    encoding: 'utf8',
    env: { ...process.env, GITHUB_EVENT_NAME: eventName, GITHUB_REPOSITORY: repository },
    input: JSON.stringify({ pull_request: {
      base: { ref: base, repo: { full_name: repository } },
      head: { ref: head, repo: { full_name: headRepo } },
    } }),
  },
);

test('allows internal feature, release and release-sync routes', () => {
  for (const [base, head] of [['dev', 'codex/fix'], ['main', 'dev'], ['dev', 'main']]) {
    assert.equal(run(base, head).status, 0);
  }
});
test('rejects direct feature releases, unnamed features and fork lookalikes', () => {
  for (const [base, head, repo] of [
    ['main', 'codex/fix', repository], ['dev', 'codex/', repository],
    ['main', 'dev', 'other/native-learning'], ['dev', 'codex/fix', 'other/native-learning'],
  ]) assert.equal(run(base, head, repo).status, 1);
});
test('non-PR validation does not claim release approval', () => {
  const result = run('dev', 'codex/fix', repository, 'push');
  assert.equal(result.status, 0);
  assert.match(result.stdout, /not release approval/);
});
