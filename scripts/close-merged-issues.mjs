import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

// Deliberately narrower than GitHub's prose parser. One explicit closure per line.
export function closingIssues(body, repository) {
  if (typeof body !== 'string' || body.length > 65_536) return [];
  const lines = body.split(/\r?\n/);
  // This is not a full Markdown parser. Mixed HTML/quote/code lines have ambiguous
  // precedence, so require a human to close issues for the entire PR body.
  if (lines.some(line => line.includes('`') && /<!--|-->|<\/?[a-z]|^\s*>/i.test(line))) return [];
  const numbers = new Set();
  let fence = null, comment = false, quote = false, inlineTicks = null;
  const html = [], voidTags = new Set(['area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input', 'link', 'meta', 'param', 'source', 'track', 'wbr']);
  for (const line of lines) {
    const marker = /^ {0,3}(`{3,}|~{3,})(.*)$/.exec(line);
    if (fence) {
      if (marker && marker[1][0] === fence[0] && marker[1].length >= fence.length && !marker[2].trim()) fence = null;
      continue;
    }
    if (marker && inlineTicks === null) { fence = marker[1]; continue; }
    const wasInline = inlineTicks !== null;
    // Conservatively treat escaped runs as delimiters too. Code content is never
    // actionable, and HTML/comment markers have no meaning inside a code span.
    const ticks = [...line.matchAll(/(`+)/g)];
    for (const tick of ticks) {
      if (inlineTicks === null) inlineTicks = tick[1].length;
      else if (inlineTicks === tick[1].length) inlineTicks = null;
    }
    if (wasInline || ticks.length) continue;
    if (comment || line.includes('<!--')) {
      comment = !line.includes('-->');
      continue;
    }
    const wasHTML = html.length > 0;
    const tags = [...line.matchAll(/<(\/?)([a-z][\w-]*)(?=[\s/>]|$)([^>]*)>?/gi)];
    for (const tag of tags) {
      const name = tag[2].toLowerCase();
      if (tag[1]) {
        const index = html.lastIndexOf(name);
        if (index >= 0) html.splice(index);
      } else if (!voidTags.has(name) && !tag[3].trimEnd().endsWith('/')) html.push(name);
    }
    if (wasHTML || tags.length) continue;
    if (/^\s*>/.test(line)) { quote = true; continue; }
    if (!line.trim()) quote = false;
    if (quote) continue;
    const match = /^(?:close[sd]?|fix(?:es|ed)?|resolve[sd]?) (?:([A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+))?#([1-9][0-9]*)\s*$/i.exec(line);
    if (!match || (match[1] && match[1].toLowerCase() !== repository.toLowerCase())) continue;
    const number = Number(match[2]);
    if (Number.isSafeInteger(number)) numbers.add(number);
  }
  return [...numbers];
}

export async function closeMergedIssues({ event, repository, request }) {
  if (repository !== 'codeyoma/meta-shadowing' || event.repository?.full_name !== repository ||
      event.ref !== 'refs/heads/dev' || event.forced || event.deleted ||
      ![event.before, event.after].every(sha => /^[0-9a-f]{40}$/.test(sha) && !/^0+$/.test(sha))) return [];
  const prefix = `repos/${repository}`, commits = new Set();
  let total;
  for (let page = 1; ; page++) {
    const result = await request('GET', `${prefix}/compare/${event.before}...${event.after}?per_page=100&page=${page}`);
    if (!['ahead', 'identical'].includes(result.status) || !Number.isSafeInteger(result.total_commits) ||
        result.total_commits < 0 || !Array.isArray(result.commits)) throw new Error('Unverified dev push comparison.');
    total ??= result.total_commits;
    if (total !== result.total_commits || total > 10_000) throw new Error('Unexpected dev push size.');
    for (const commit of result.commits) {
      if (!/^[0-9a-f]{40}$/.test(commit.sha)) throw new Error('Invalid compared commit.');
      commits.add(commit.sha);
    }
    if (commits.size === total) break;
    if (result.commits.length < 100 || commits.size > total || page >= 100) throw new Error('Incomplete dev push comparison.');
  }
  const numbers = new Set();
  for (const sha of commits) {
    for (let page = 1; ; page++) {
      const pulls = await request('GET', `${prefix}/commits/${sha}/pulls?per_page=100&page=${page}`);
      if (!Array.isArray(pulls)) throw new Error('Invalid associated pull request response.');
      for (const pull of pulls) {
        if (!Number.isSafeInteger(pull.number) || pull.number < 1) throw new Error('Invalid pull request number.');
        numbers.add(pull.number);
      }
      if (pulls.length < 100) break;
      if (page >= 100) throw new Error('Too many associated pull requests.');
    }
  }
  const issues = new Set();
  for (const number of numbers) {
    const pull = await request('GET', `${prefix}/pulls/${number}`);
    if (pull.number !== number || pull.merged !== true || !pull.merged_at ||
        pull.base?.ref !== 'dev' || pull.base?.repo?.full_name !== repository ||
        pull.head?.repo?.full_name !== repository || !pull.head?.ref?.startsWith('codex/') ||
        !commits.has(pull.merge_commit_sha)) continue;
    for (const issue of closingIssues(pull.body, repository)) issues.add(issue);
  }
  // Finish all merge validation before making the first write. Reruns are safe.
  const closed = [];
  for (const number of issues) {
    const issue = await request('GET', `${prefix}/issues/${number}`);
    if (issue.number !== number || issue.pull_request || issue.state !== 'open') continue;
    await request('PATCH', `${prefix}/issues/${number}`, { state: 'closed', state_reason: 'completed' });
    closed.push(number);
  }
  return closed;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  try {
    if (process.env.GITHUB_EVENT_NAME !== 'push') throw new Error('Only trusted dev push events are supported.');
    const token = process.env.GITHUB_TOKEN;
    if (!token) throw new Error('Missing repository token.');
    const event = JSON.parse(await readFile(process.env.GITHUB_EVENT_PATH, 'utf8'));
    const closed = await closeMergedIssues({ event, repository: process.env.GITHUB_REPOSITORY,
      request: async (method, path, body) => {
        const result = await fetch(`https://api.github.com/${path}`, {
          method, redirect: 'error', signal: AbortSignal.timeout(30_000),
          headers: { Authorization: `Bearer ${token}`, Accept: 'application/vnd.github+json',
            'X-GitHub-Api-Version': '2022-11-28', 'Content-Type': 'application/json' },
          ...(body ? { body: JSON.stringify(body) } : {})
        });
        if (!result.ok) throw new Error(`GitHub request failed (${result.status}).`);
        return result.json();
      }
    });
    console.log(`Closed ${closed.length} issue(s) after verified dev merge.`);
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
