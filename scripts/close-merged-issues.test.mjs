import assert from 'node:assert/strict';
import test from 'node:test';
import { closingIssues, closeMergedIssues } from './close-merged-issues.mjs';

const repository = 'codeyoma/meta-shadowing';
const before = 'a'.repeat(40), after = 'b'.repeat(40), merge = 'c'.repeat(40);
const event = { ref: 'refs/heads/dev', before, after, forced: false, deleted: false, repository: { full_name: repository } };
const pr = { number: 101, merged: true, merged_at: '2026-09-27T00:00:00Z', merge_commit_sha: merge,
  base: { ref: 'dev', repo: { full_name: repository } }, head: { ref: 'codex/example', repo: { full_name: repository } }, body: 'Closes #94' };
function fixture(overrides = {}) {
  const writes = [], reads = [];
  const request = async (method, path, body) => {
    if (method === 'PATCH') { writes.push({ path, body }); return {}; }
    reads.push(path);
    if (overrides[path] !== undefined) return overrides[path];
    if (path.includes('/compare/')) return { status: 'ahead', total_commits: 1, commits: [{ sha: merge }] };
    if (path.includes('/commits/')) return [{ number: pr.number }];
    if (path.endsWith('/pulls/101')) return pr;
    if (path.endsWith('/issues/94')) return { number: 94, state: 'open' };
    throw new Error(`Unexpected test request: ${path}`);
  };
  return { writes, reads, request };
}
test('only explicit standalone same-repository closure lines are actionable', () => {
  assert.deepEqual(closingIssues(`Closes #94\nfixes codeyoma/meta-shadowing#95\nResolves #96
Refs #97
> Closes #98
    Closes #99
\`\`\`md
Closes #100
\`\`\`
<!--
Closes #101
-->
~~~
Closes #102
~~~
Closes foreign/repo#103
An example: Closes #104
Closes #94
Closes #0`, repository), [94, 95, 96]);
});
test('HTML blocks and multiline inline code cannot close issues', () => {
  for (const body of ['<pre>\nCloses #94\n</pre>', '<code class="example">\nCloses #94\n</code>',
    '<blockquote>\nCloses #94\n</blockquote>', '`example\nCloses #94\n`', '``example with ` inside\nCloses #94\n``',
    '<div>\n<div>example</div>\nCloses #94\n</div>', '<pre\nclass="example">\nCloses #94\n</pre>']) {
    assert.deepEqual(closingIssues(`${body}\n\nCloses #95`, repository), [95]);
  }
});
test('escaped and mixed-markup backtick spans cannot close issues', () => {
  const spans = [
    '\\\\`example\nCloses #94\n`',
    '`example\n```\nCloses #94\n```\n`',
  ];
  for (const body of spans) {
    assert.deepEqual(closingIssues(`${body}\n\nCloses #95`, repository), [95]);
  }
});
test('ambiguous mixed HTML, quotes and code fails closed for the entire body', () => {
  for (const body of ['`<!-- -->\nCloses #94\n`',
    '<!-- Example `close`\nCloses #94\n-->',
    '<pre>Example `close`\nCloses #94\n</pre>',
    '> Example `close`\nCloses #94']) {
    assert.deepEqual(closingIssues(`${body}\n\nCloses #95`, repository), []);
  }
});
test('verified internal dev merge closes linked issues, not pull requests', async () => {
  const f = fixture({ [`repos/${repository}/pulls/101`]: { ...pr, body: 'Closes #94\nCloses #95' },
    [`repos/${repository}/issues/95`]: { number: 95, state: 'open', pull_request: {} } });
  assert.deepEqual(await closeMergedIssues({ event, repository, request: f.request }), [94]);
  assert.deepEqual(f.writes, [{ path: `repos/${repository}/issues/94`, body: { state: 'closed', state_reason: 'completed' } }]);
});
test('wrong repository, branch, forced push or creation cannot close anything', async () => {
  for (const change of [{ ref: 'refs/heads/main' }, { forced: true }, { deleted: true }, { before: '0'.repeat(40) },
    { repository: { full_name: 'foreign/repo' } }]) {
    const f = fixture();
    assert.deepEqual(await closeMergedIssues({ event: { ...event, ...change }, repository, request: f.request }), []);
    assert.equal(f.reads.length, 0); assert.equal(f.writes.length, 0);
  }
});
test('unmerged, foreign, wrong-base, wrong-head and historical PRs are ignored', async () => {
  for (const change of [{ merged: false }, { merged_at: null }, { base: { ...pr.base, ref: 'main' } },
    { head: { ...pr.head, ref: 'dev' } }, { head: { ...pr.head, repo: { full_name: 'foreign/repo' } } },
    { merge_commit_sha: 'd'.repeat(40) }]) {
    const f = fixture({ [`repos/${repository}/pulls/101`]: { ...pr, ...change } });
    assert.deepEqual(await closeMergedIssues({ event, repository, request: f.request }), []);
    assert.equal(f.writes.length, 0);
  }
});
test('closed issues make reruns idempotent', async () => {
  const f = fixture({ [`repos/${repository}/issues/94`]: { number: 94, state: 'closed' } });
  assert.deepEqual(await closeMergedIssues({ event, repository, request: f.request }), []);
  assert.equal(f.writes.length, 0);
});
test('all compared commits and associated PR pages are inspected once', async () => {
  const commits = Array.from({ length: 100 }, (_, i) => ({ sha: i.toString(16).padStart(40, '0') }));
  const f = fixture({ [`repos/${repository}/compare/${before}...${after}?per_page=100&page=1`]: { status: 'ahead', total_commits: 101, commits },
    [`repos/${repository}/compare/${before}...${after}?per_page=100&page=2`]: { status: 'ahead', total_commits: 101, commits: [{ sha: merge }] },
    [`repos/${repository}/commits/${merge}/pulls?per_page=100&page=1`]: Array.from({ length: 100 }, () => ({ number: 101 })),
    [`repos/${repository}/commits/${merge}/pulls?per_page=100&page=2`]: [] });
  assert.deepEqual(await closeMergedIssues({ event, repository, request: f.request }), [94]);
  assert.equal(f.reads.filter(p => p.endsWith('/pulls/101')).length, 1);
  assert(f.reads.includes(`repos/${repository}/commits/${merge}/pulls?per_page=100&page=2`));
});
test('truncated or divergent comparison fails closed', async () => {
  for (const comparison of [{ status: 'diverged', total_commits: 1, commits: [{ sha: merge }] },
    { status: 'ahead', total_commits: 2, commits: [{ sha: merge }] }]) {
    const f = fixture({ [`repos/${repository}/compare/${before}...${after}?per_page=100&page=1`]: comparison });
    await assert.rejects(closeMergedIssues({ event, repository, request: f.request }));
    assert.equal(f.writes.length, 0);
  }
});
