import type { Database } from './journal';
import type { Row, Table } from './progress-backup-codec';
import type { Session } from './session';
import { MAX_XP } from './levels';
import { MAX_OBSERVED_CYCLES, type UnitCredit } from './unit-credit';
import { unitProgress } from './unit-progress';

export type Stamp = string;
export type CreditCandidate = { credited: number; counts: number[] };
// Omitted on historical receipts: old confirmations always retain their value.
export type SourceCycle = { source: number; ordinal: number };
export type Confirmation = { unit: number; ordinal: number; day: string; multiplier?: 3; weight?: number; sources?: SourceCycle[] };
export type SyncRun = {
  package: string; stage: number; run: string; language: string; book: string;
  sourceCount: number; groupSize: number; observed: number[];
  candidates: CreditCandidate[]; events: Confirmation[];
  lineage?: string;
};
export type SyncLedger = { clocks: Record<string, Stamp>; runs: SyncRun[] };
export function stringifyCounts(value: unknown): string {
  return JSON.stringify(value, (key, value) => {
    if ((key !== 'counts' && key !== 'observed') || !Array.isArray(value)) return value;
    const groups: string[] = [];
    for (let i = 0; i < value.length;) {
      let end = i + 1;
      while (end < value.length && value[end] === value[i]) end++;
      groups.push(`${end - i}*${value[i]}`); i = end;
    }
    const encoded = groups.join(',');
    return encoded.length + 2 < JSON.stringify(value).length ? encoded : value;
  });
}
export const runKey = (row: Pick<SyncRun, 'package' | 'stage' | 'run'> | Row) => JSON.stringify([row.package, row.stage, row.run]);
export const checkpointKey = (key: string, stage: number) => JSON.stringify(['checkpoint', key, stage]);
export const preferenceKey = (key: string) => JSON.stringify(['preference', key]);
const eventKey = (event: Confirmation) => JSON.stringify([event.unit, event.ordinal]);
const stable = <T>(values: T[]) => [...new Map(values.map(value => [JSON.stringify(value), value])).values()]
  .sort((a, b) => JSON.stringify(a) < JSON.stringify(b) ? -1 : JSON.stringify(a) > JSON.stringify(b) ? 1 : 0);

export function canonicalLedger(ledger: SyncLedger): SyncLedger {
  return { clocks: Object.fromEntries(Object.entries(ledger.clocks).sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0)),
    runs: ledger.runs.map(run => ({ ...run, candidates: stable(run.candidates), events: stable(run.events) }))
      .sort((a, b) => runKey(a) < runKey(b) ? -1 : runKey(a) > runKey(b) ? 1 : 0) };
}

export function createSyncTable(db: Database) {
  db.exec('CREATE TABLE IF NOT EXISTS progress_sync_ledger (id INTEGER PRIMARY KEY CHECK(id=1), state TEXT NOT NULL); CREATE TABLE IF NOT EXISTS progress_sync_clock (id INTEGER PRIMARY KEY CHECK(id=1), writer TEXT NOT NULL, last TEXT NOT NULL); CREATE TABLE IF NOT EXISTS progress_sync_runs (key TEXT PRIMARY KEY, state TEXT NOT NULL);');
  db.run('INSERT OR IGNORE INTO progress_sync_ledger(id,state) VALUES (1,?)', JSON.stringify({ clocks: {}, runs: [] }));
  db.run('INSERT OR IGNORE INTO progress_sync_clock(id,writer,last) VALUES (1,?,?)', `${Math.random().toString(36).slice(2)}${Math.random().toString(36).slice(2)}`, '');
  // This is a local persistence migration, not a learning action or a new backup
  // version. A failed move leaves the original blob intact for the next startup.
  db.exec('SAVEPOINT migrate_progress_sync_runs');
  try {
    const previous = JSON.parse(db.first<{ state: string }>('SELECT state FROM progress_sync_ledger WHERE id=1')!.state) as SyncLedger;
    if (previous.runs.length) {
      for (const run of previous.runs) db.run('INSERT INTO progress_sync_runs(key,state) VALUES (?,?)', runKey(run), JSON.stringify(run));
      db.run('UPDATE progress_sync_ledger SET state=? WHERE id=1', JSON.stringify({ clocks: previous.clocks, runs: [] }));
    }
    db.exec('RELEASE migrate_progress_sync_runs');
  } catch (error) { db.exec('ROLLBACK TO migrate_progress_sync_runs'); db.exec('RELEASE migrate_progress_sync_runs'); throw error; }
}
/** With a key, loads only that run. Empty key reads only ordering metadata. */
export function readSync(db: Database, key?: string): SyncLedger {
  const ledger = JSON.parse(db.first<{ state: string }>('SELECT state FROM progress_sync_ledger WHERE id=1')!.state) as SyncLedger;
  if (key !== undefined) {
    const row = key ? db.first<{ state: string }>('SELECT state FROM progress_sync_runs WHERE key=?', key) : null;
    ledger.runs = row ? [JSON.parse(row.state)] : [];
  } else {
    const rows = db.first<{ states: string }>("SELECT '[' || COALESCE(group_concat(state, ','), '') || ']' AS states FROM progress_sync_runs")!;
    ledger.runs = JSON.parse(rows.states);
  }
  return ledger;
}
export function saveSync(db: Database, ledger: SyncLedger, partial = false) {
  const canonical = canonicalLedger(ledger);
  if (!partial) db.run('DELETE FROM progress_sync_runs');
  for (const run of canonical.runs) db.run('INSERT INTO progress_sync_runs(key,state) VALUES (?,?) ON CONFLICT(key) DO UPDATE SET state=excluded.state', runKey(run), JSON.stringify(run));
  db.run('UPDATE progress_sync_ledger SET state=? WHERE id=1', JSON.stringify({ clocks: canonical.clocks, runs: [] }));
}
export function nextStamp(db: Database, ledger: SyncLedger, now: number): Stamp {
  const clock = db.first<{ writer: string; last: string }>('SELECT writer,last FROM progress_sync_clock WHERE id=1')!;
  const last = Object.values(ledger.clocks).reduce((max, stamp) => stamp > max ? stamp : max, clock.last);
  const [physical = '0', counter = '0'] = last.split(':');
  const time = Math.max(Math.max(0, Math.floor(now)), Number(physical));
  const ordinal = time === Number(physical) ? Number(counter) + 1 : 0;
  if (!Number.isSafeInteger(time) || !Number.isSafeInteger(ordinal) || ordinal > 9999999999) throw Error('Learning clock is exhausted.');
  const stamp = `${String(time).padStart(16, '0')}:${String(ordinal).padStart(10, '0')}:${clock.writer}`;
  db.run('UPDATE progress_sync_clock SET last=? WHERE id=1', stamp);
  return stamp;
}
export function seedRun(row: Row, unit?: UnitCredit, checkpoint?: Session): SyncRun {
  const count = Number(row.phrase_count);
  const counts = unit?.counts ?? Array.from({ length: count }, (_, i) => i < Number(row.phrase) ? MAX_OBSERVED_CYCLES : i === Number(row.phrase) ? Number(row.confirmed) : 0);
  return { package: String(row.package), stage: Number(row.stage), run: String(row.run), language: String(row.language), book: String(row.book),
    sourceCount: unit?.sourceCount ?? (checkpoint ? checkpoint.version === 2 ? checkpoint.sourcePhraseCount : checkpoint.phraseCount : 0),
    groupSize: unit?.groupSize ?? (checkpoint ? checkpoint.version === 2 ? checkpoint.groupSize : 1 : 0),
    observed: [...counts], candidates: [{ credited: Number(row.credited), counts: [...counts] }], events: [] };
}
export function seedLedger(tables: Record<Table, Row[]>, ledger: SyncLedger = { clocks: {}, runs: [] }): SyncLedger {
  ledger = JSON.parse(JSON.stringify(ledger));
  const known = new Set(ledger.runs.map(runKey));
  const units = new Map(tables.unit_credits.map(row => [runKey(row), row]));
  const checkpoints = new Map(tables.checkpoints.map(row => [JSON.stringify([row.package, row.stage, JSON.parse(String(row.state)).runId]), row]));
  for (const row of tables.checkpoints) ledger.clocks[checkpointKey(String(row.package), Number(row.stage))] ??= '';
  for (const row of tables.preferences) ledger.clocks[preferenceKey(String(row.key))] ??= '';
  for (const row of tables.cycle_credits) {
    if (known.has(runKey(row))) continue;
    const unit = units.get(runKey(row));
    const checkpoint = checkpoints.get(runKey(row));
    ledger.runs.push(seedRun(row, unit ? JSON.parse(String(unit.state)) : undefined, checkpoint ? JSON.parse(String(checkpoint.state)) : undefined));
  }
  return ledger;
}
function candidateCredit(run: SyncRun, candidate: CreditCandidate): number {
  const weight = (unit: number) => Math.min(run.groupSize, run.sourceCount - unit * run.groupSize);
  return Math.min(MAX_XP, candidate.credited + run.events.reduce((sum, event) =>
    sum + (event.ordinal > candidate.counts[event.unit]! ? (event.weight ?? weight(event.unit)) * (event.multiplier ?? 1) : 0), 0));
}
export function creditTotal(run: SyncRun): number {
  return run.candidates.reduce((best, candidate) => Math.max(best, candidateCredit(run, candidate)), 0);
}
/** Source ordinals, unlike group ordinals, survive changes to group boundaries. */
export function confirmedSources(prior: Session): Pick<Confirmation, 'sources'> {
  if (prior.version !== 2) return {};
  const start = prior.phrase * prior.groupSize;
  const sources = Array.from({ length: Math.min(prior.groupSize, prior.sourcePhraseCount - start) }, (_, offset) => {
    const source = start + offset, progress = prior.sourceProgress?.[source];
    return progress && progress.confirmed === progress.planned ? [] : [{ source, ordinal: (progress?.confirmed ?? prior.confirmed) + 1 }];
  }).flat();
  return { sources };
}

/** Raw per-plan projections remain immutable; only overlapping source receipts are removed from totals. */
export function duplicateSourceCredit(runs: SyncRun[]): number {
  const groups = new Map<string, SyncRun[]>();
  for (const run of runs) {
    const key = JSON.stringify([run.package, run.stage, run.lineage ?? run.run]);
    const group = groups.get(key) ?? [];
    group.push(run); groups.set(key, group);
  }
  let duplicates = 0;
  for (const group of groups.values()) {
    if (group.length < 2) continue;
    const root = group.find(run => !run.lineage);
    if (!root) throw Error('Missing regrouping lineage.');
    let best = 0;
    for (const candidate of root.candidates) {
      let total = candidateCredit(root, candidate);
      const seen = new Set<string>();
      for (const run of [root, ...group.filter(run => run !== root)]) {
        const baseline = run === root ? candidate : run.candidates[0]!;
        for (const event of run.events) {
          if (event.ordinal <= baseline.counts[event.unit]!) continue;
          // Old weighted receipts have no provable member identities. Keep them opaque.
          const sources = event.sources ?? (event.weight === undefined ? Array.from({ length: Math.min(run.groupSize, run.sourceCount - event.unit * run.groupSize) },
            (_, i) => ({ source: event.unit * run.groupSize + i, ordinal: event.ordinal })) : []);
          for (const source of sources) {
            const key = JSON.stringify([source.source, source.ordinal]);
            if (seen.has(key) || source.ordinal <= candidate.counts[Math.floor(source.source / root.groupSize)]!) continue;
            seen.add(key);
            if (run !== root) total++;
          }
        }
      }
      best = Math.max(best, total);
    }
    duplicates += group.reduce((sum, run) => sum + creditTotal(run), 0) - best;
  }
  return duplicates;
}
export function mergeRun(a: SyncRun, b: SyncRun): SyncRun {
  if (runKey(a) !== runKey(b) || a.language !== b.language || a.book !== b.book || a.observed.length !== b.observed.length
    || a.lineage !== b.lineage
    || (a.sourceCount && b.sourceCount && (a.sourceCount !== b.sourceCount || a.groupSize !== b.groupSize))) throw Error('Incompatible learning run identity.');
  const events = new Map<string, Confirmation>();
  for (const event of [...a.events, ...b.events]) {
    const old = events.get(eventKey(event));
    if (old && old.weight !== event.weight) throw Error('Conflicting confirmation weight.');
    if (old?.sources && event.sources && JSON.stringify(old.sources) !== JSON.stringify(event.sources)) throw Error('Conflicting source confirmation.');
    events.set(eventKey(event), { ...event, day: old && old.day < event.day ? old.day : event.day,
      ...((old?.sources ?? event.sources) ? { sources: old?.sources ?? event.sources } : {}),
      ...(old?.multiplier === 3 || event.multiplier === 3 ? { multiplier: 3 as const } : {}) });
  }
  return { ...a, sourceCount: a.sourceCount || b.sourceCount, groupSize: a.groupSize || b.groupSize,
    observed: a.observed.map((count, i) => Math.max(count, b.observed[i]!)), candidates: stable([...a.candidates, ...b.candidates]), events: stable([...events.values()]) };
}
export function mergeLedger(a: SyncLedger, b: SyncLedger): SyncLedger {
  const clocks = { ...a.clocks };
  for (const [key, value] of Object.entries(b.clocks)) clocks[key] = clocks[key] && clocks[key]! > value ? clocks[key]! : value;
  const runs = new Map(a.runs.map(run => [runKey(run), run]));
  for (const run of b.runs) runs.set(runKey(run), runs.has(runKey(run)) ? mergeRun(runs.get(runKey(run))!, run) : run);
  return { clocks, runs: [...runs.values()] };
}
export function bindRun(db: Database, ledger: SyncLedger, key: string, state: Session, identity: { language: string; book: string }): SyncRun {
  if (state.lineage) {
    const row = db.first<{ state: string }>('SELECT state FROM progress_sync_runs WHERE key=?', JSON.stringify([key, state.stage, state.lineage]));
    const root: SyncRun | undefined = row ? JSON.parse(row.state) : undefined;
    if (!root || root.lineage || root.language !== identity.language || root.book !== identity.book
      || state.version !== 2 || root.sourceCount !== state.sourcePhraseCount) throw Error('Invalid regrouping lineage.');
  }
  let run = ledger.runs.find(run => runKey(run) === JSON.stringify([key, state.stage, state.runId]));
  if (!run) {
    const row = db.first<Row>('SELECT * FROM cycle_credits WHERE package=? AND stage=? AND run=?', key, state.stage, state.runId);
    const unit = db.first<{ state: string }>('SELECT state FROM unit_credits WHERE package=? AND stage=? AND run=?', key, state.stage, state.runId);
    run = row ? seedRun(row, unit ? JSON.parse(unit.state) : undefined, state) : { package: key, stage: state.stage, run: state.runId, ...identity,
      ...(state.lineage ? { lineage: state.lineage } : {}),
      sourceCount: state.version === 2 ? state.sourcePhraseCount : state.phraseCount, groupSize: state.version === 2 ? state.groupSize : 1,
      observed: unitProgress(state).map(unit => unit.confirmed), candidates: [{ credited: 0, counts: unitProgress(state).map(unit => unit.confirmed) }], events: [] };
    ledger.runs.push(run);
  }
  const source = state.version === 2 ? state.sourcePhraseCount : state.phraseCount, size = state.version === 2 ? state.groupSize : 1;
  if (run.language !== identity.language || run.book !== identity.book || run.observed.length !== state.phraseCount || run.lineage !== state.lineage
    || (run.sourceCount && (run.sourceCount !== source || run.groupSize !== size))) throw Error('Conflicting learning run plan.');
  run.sourceCount = source; run.groupSize = size;
  return run;
}
