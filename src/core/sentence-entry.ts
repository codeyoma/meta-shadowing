export type SentenceEntryScope = { profile: string; packageKey: string; stage: number; runId: string; phrase: number };
/** An in-memory, one-shot handoff; never restore autoplay from disk or route params. */
export function createSentenceEntry(now = Date.now) {
  let pending: { scope: SentenceEntryScope; expires: number } | null = null;
  return {
    request(scope: SentenceEntryScope) { pending = { scope: { ...scope }, expires: now() + 30_000 }; },
    cancel() { pending = null; },
    consume(scope: SentenceEntryScope) {
      const request = pending; pending = null;
      return !!request && now() <= request.expires &&
        (Object.keys(scope) as (keyof SentenceEntryScope)[]).every(key => request.scope[key] === scope[key]);
    },
  };
}
export const sentenceEntry = createSentenceEntry();
