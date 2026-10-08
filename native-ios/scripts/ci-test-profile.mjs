import { readFileSync } from 'node:fs';

try {
  const event = JSON.parse(readFileSync(0, 'utf8'));
  const eventName = process.env.GITHUB_EVENT_NAME;
  if (!event || typeof event !== 'object' || Array.isArray(event)) {
    throw new Error('Invalid native CI event.');
  }
  const ordinary = (eventName === 'pull_request' &&
    ['dev', 'main'].includes(event.pull_request?.base?.ref)) ||
    (eventName === 'push' && ['refs/heads/dev', 'refs/heads/main'].includes(event.ref));
  let scope = 'fast';
  if (eventName === 'workflow_dispatch') {
    if (event.inputs !== undefined && (!event.inputs || typeof event.inputs !== 'object' || Array.isArray(event.inputs))) {
      throw new Error('Invalid native CI dispatch inputs.');
    }
    scope = event.inputs?.test_scope === undefined ? 'full' : event.inputs.test_scope;
    if (!['fast', 'full'].includes(scope)) throw new Error('Unknown native CI test scope.');
  } else if (!ordinary) {
    throw new Error('Unsupported native CI event.');
  }
  const shards = scope === 'full'
    ? ['player', 'player-options', 'product', 'remaining']
    : ['fast-player', 'fast-native'];
  console.log(`test-scope=${scope}`);
  console.log(`matrix=${JSON.stringify({ shard: shards })}`);
} catch (error) {
  console.error(error instanceof SyntaxError ? 'Invalid native CI event JSON.' : error.message);
  process.exitCode = 1;
}
