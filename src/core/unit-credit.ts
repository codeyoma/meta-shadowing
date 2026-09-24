import type { Database } from './journal';
import { transition, type Session } from './session';
import { unitProgress } from './session-navigation';
import { MAX_XP } from './levels';
import { isRevealStage } from './catalog';

export type UnitCredit = { counts: number[]; sourceCount: number; groupSize: number; baseline: number; earned: number };
// Legacy frontiers lost exact optional-cycle counts for earlier units. Fence
// those observed cycles at the same validated bound instead of minting them again.
export const MAX_OBSERVED_CYCLES = 100000;
function sameCheckpoint(a: Session, b: Session): boolean {
  return (Object.keys(b) as (keyof Session)[]).every(key => key === 'sourceProgress'
    ? JSON.stringify(a.sourceProgress) === JSON.stringify(b.sourceProgress) : key === 'unitProgress'
    ? !!a.unitProgress && !!b.unitProgress && a.unitProgress.length === b.unitProgress.length
      && b.unitProgress.every((unit, i) => unit.confirmed === a.unitProgress![i]!.confirmed && unit.planned === a.unitProgress![i]!.planned)
    : key === 'reveal' ? a.reveal?.speed === b.reveal?.speed && a.reveal?.wpm === b.reveal?.wpm : a[key] === b[key]);
}
export function unitWeight(state: Session, phrase: number): number {
  if (state.version === 2 && state.sourceProgress) return state.sourceProgress.slice(phrase * state.groupSize, (phrase + 1) * state.groupSize)
    .filter(p => p.confirmed < p.planned).length;
  return isRevealStage(state.stage) ? 3 : state.version === 2 ? Math.min(state.groupSize, state.sourcePhraseCount - phrase * state.groupSize) : 1;
}
export function validUnitCredit(value: UnitCredit, stage = 0): boolean {
  return !!value && Object.keys(value).sort().join(',') === 'baseline,counts,earned,groupSize,sourceCount'
    && Number.isSafeInteger(value.sourceCount) && value.sourceCount >= 1 && value.sourceCount <= 100000
    && [1, 2, 3, 4].includes(value.groupSize)
    && Array.isArray(value.counts) && value.counts.length === Math.ceil(value.sourceCount / value.groupSize)
    && value.counts.every(n => Number.isSafeInteger(n) && n >= 0 && n <= MAX_OBSERVED_CYCLES)
    && Number.isSafeInteger(value.baseline) && value.baseline >= 0 && value.baseline <= MAX_XP
    && Number.isSafeInteger(value.earned) && value.earned >= 0 && value.earned <= MAX_XP - value.baseline
    && value.earned <= value.counts.reduce((sum, n, i) => sum + n * Math.min(value.groupSize, value.sourceCount - i * value.groupSize) * (isRevealStage(stage) ? 3 : 1), 0);
}
export function recordUnitCredit(db: Database, key: string, next: Session, prior: Session | null,
  credited: number, locked: boolean, mayCredit: boolean, frontier?: { phrase: number; confirmed: number }): number {
  const row = db.first<{ state: string }>('SELECT state FROM unit_credits WHERE package=? AND stage=? AND run=?', key, next.stage, next.runId);
  const base = prior ?? next;
  const ledger: UnitCredit = row ? JSON.parse(row.state) : {
    counts: unitProgress(base).map((unit, i) => Math.max(unit.confirmed, frontier ? i < frontier.phrase ? MAX_OBSERVED_CYCLES : i === frontier.phrase ? frontier.confirmed : 0 : 0)), sourceCount: next.version === 2 ? next.sourcePhraseCount : next.phraseCount,
    groupSize: next.version === 2 ? next.groupSize : 1, baseline: credited, earned: 0,
  };
  if (!validUnitCredit(ledger, next.stage) || ledger.sourceCount !== (next.version === 2 ? next.sourcePhraseCount : next.phraseCount)
    || ledger.groupSize !== (next.version === 2 ? next.groupSize : 1) || ledger.baseline + ledger.earned !== credited) throw Error('Conflicting unit credit plan.');
  const observed = unitProgress(next);
  // An ordinary stale checkpoint may be resumed, but cannot close the run with
  // fewer cycles than already observed. Once closed its exact frontier is fixed.
  // The legacy lower-unit fence is credit provenance, not a real cycle count.
  if (next.phase === 'complete' && ledger.counts.some((count, i) => count !== MAX_OBSERVED_CYCLES
    && (locked ? observed[i]!.confirmed !== count : observed[i]!.confirmed < count))) {
    throw Error('Conflicting completed unit frontier.');
  }
  const accepted = prior && unitProgress(next)[prior.phrase]!.confirmed === prior.confirmed + 1
    && (['confirm', 'repeat', 'next'] as const).some(type =>
    sameCheckpoint(transition(prior, { type }), next));
  if (!locked && mayCredit && prior?.phase === 'speaking' && accepted && prior.confirmed === ledger.counts[prior.phrase]) {
    ledger.earned = Math.min(MAX_XP - ledger.baseline, ledger.earned + unitWeight(prior, prior.phrase));
  }
  ledger.counts = ledger.counts.map((count, i) => Math.max(count, observed[i]!.confirmed));
  db.run(`INSERT INTO unit_credits(package,stage,run,state) VALUES (?,?,?,?)
    ON CONFLICT(package,stage,run) DO UPDATE SET state=excluded.state`, key, next.stage, next.runId, JSON.stringify(ledger));
  return ledger.baseline + ledger.earned;
}
