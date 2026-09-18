import { createSession } from '../src/core/session';

// Historical checkpoints had only a linear frontier. Keep existing migration,
// hand-built checkpoint and recovery scenarios independent of fresh-run fields.
export function createLegacySession(input: Parameters<typeof createSession>[0]) {
  const { unitProgress: _progress, ...legacy } = createSession(input);
  return legacy;
}
