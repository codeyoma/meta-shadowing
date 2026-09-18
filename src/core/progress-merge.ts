import type { ProgressBackup, Row, Table } from './progress-backup-codec';
import { canonicalLedger, checkpointKey, creditTotal, mergeLedger, preferenceKey, runKey } from './sync-ledger';

const keys: Record<Table, string[]> = {
  checkpoints: ['package', 'stage'], completions: ['package', 'stage', 'run'],
  daily_stages: ['language', 'book', 'day'], stage_awards: ['language', 'book', 'run'],
  study_days: ['language', 'day'], preferences: ['key'], cycle_credits: ['package', 'stage', 'run'], unit_credits: ['package', 'stage', 'run'],
};
const lexical = (a: Row, b: Row) => JSON.stringify(a) < JSON.stringify(b) ? a : b;

/** Pure set union. Materialized totals never become new legacy candidates. */
export function mergeProgress(a: ProgressBackup, b: ProgressBackup): ProgressBackup {
  const sync = canonicalLedger(mergeLedger(a.sync, b.sync));
  const tables = {} as ProgressBackup['tables'];
  for (const table of Object.keys(keys) as Table[]) {
    const rows = new Map<string, Row>();
    for (const row of a.tables[table]) rows.set(JSON.stringify(keys[table].map(key => row[key])), { ...row });
    for (const right of b.tables[table]) {
      const key = JSON.stringify(keys[table].map(key => right[key])), left = rows.get(key);
      if (!left) { rows.set(key, { ...right }); continue; }
      let chosen = lexical(left, right);
      if (table === 'checkpoints' || table === 'preferences') {
        const clock = table === 'checkpoints' ? checkpointKey(String(right.package), Number(right.stage)) : preferenceKey(String(right.key));
        const l = a.sync.clocks[clock] ?? '', r = b.sync.clocks[clock] ?? '';
        chosen = l > r ? left : r > l ? right : chosen;
      } else if (table === 'stage_awards') {
        // Original formats validate daily policy before import. Across devices the
        // same receipt is retained once; already granted distinct awards survive.
        if (left.stage !== right.stage) throw Error('Incompatible historical award identity.');
        chosen = Number(left.xp) > Number(right.xp) ? left : Number(right.xp) > Number(left.xp) ? right : chosen;
      } else if (table === 'completions') {
        chosen = String(left.completed_at) < String(right.completed_at) ? left : right;
      } else if (table === 'cycle_credits') {
        if (left.language !== right.language || left.book !== right.book || left.phrase_count !== right.phrase_count) throw Error('Incompatible cycle identity.');
        const frontier = Number(left.phrase) - Number(right.phrase) || Number(left.confirmed) - Number(right.confirmed);
        chosen = { ...(frontier > 0 ? left : frontier < 0 ? right : chosen),
          day: [String(left.day), String(right.day)].filter(Boolean).sort()[0] ?? '' };
      }
      rows.set(key, { ...chosen });
    }
    tables[table] = [...rows.values()];
  }
  tables.unit_credits = [];
  const cycles = new Map(tables.cycle_credits.map(row => [runKey(row), row]));
  const completed = new Set(tables.completions.map(runKey));
  for (const run of sync.runs) {
    const row = cycles.get(runKey(run));
    if (!row) throw Error('Missing learning credit projection.');
    row.credited = creditTotal(run);
    if (completed.has(runKey(run))) {
      row.phrase = run.observed.length - 1;
      row.confirmed = run.observed.at(-1)!;
    }
    if (run.sourceCount) tables.unit_credits.push({ package: run.package, stage: run.stage, run: run.run,
      state: JSON.stringify({ counts: run.observed, sourceCount: run.sourceCount, groupSize: run.groupSize, baseline: row.credited, earned: 0 }) });
  }
  return { version: 4, tables, sync };
}
