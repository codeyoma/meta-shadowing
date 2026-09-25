import { restoreSession } from './session';
import { decodeSettings } from './settings';
import { languages, isRevealStage, type PlayableStage } from './catalog';
import { dailyLimit } from './progression';
import { validCycleIdentity } from './cycle-credit';
import { MAX_XP } from './levels';
import { validUnitCredit, type UnitCredit } from './unit-credit';
import { unitProgress } from './session-navigation';
import { canonicalLedger, creditTotal, runKey, seedLedger, stringifyCounts, type SyncLedger, type SyncRun } from './sync-ledger';

export const columns = {
  checkpoints: ['package', 'stage', 'state'],
  completions: ['package', 'stage', 'run', 'completed_at'],
  daily_stages: ['language', 'book', 'day', 'stage'],
  stage_awards: ['language', 'book', 'run', 'day', 'stage', 'xp'],
  study_days: ['language', 'day'],
  preferences: ['key', 'value'],
  cycle_credits: ['package', 'stage', 'run', 'language', 'book', 'phrase_count', 'phrase', 'confirmed', 'credited', 'day'],
  unit_credits: ['package', 'stage', 'run', 'state'],
} as const;
export type Table = keyof typeof columns;
export type Row = Record<string, string | number>;
export type ProgressBackup = { version: 4; tables: Record<Table, Row[]>; sync: SyncLedger };
/** Dense legacy fences repeat for every old unit; bound and compress on wire. */
export function encodeProgressBackup(backup: ProgressBackup): string {
  const json = stringifyCounts(backup);
  checkBackupSize(json); return json;
}
const keys: Record<Table, readonly string[]> = {
  checkpoints: ['package', 'stage'], completions: ['package', 'stage', 'run'],
  daily_stages: ['language', 'book', 'day'], stage_awards: ['language', 'book', 'run'],
  study_days: ['language', 'day'], preferences: ['key'],
  cycle_credits: ['package', 'stage', 'run'],
  unit_credits: ['package', 'stage', 'run'],
};
const limit = 16 * 1024 * 1024;
function reject(): never { throw Error('Progress backup is incompatible or damaged.'); }
function object(value: unknown, expected: readonly string[]): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return reject();
  const actual = Object.keys(value);
  if (actual.length !== expected.length || actual.some(key => !expected.includes(key))) reject();
  return value as Record<string, unknown>;
}
function integer(value: unknown, min: number, max = Number.MAX_SAFE_INTEGER): number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < min || value > max) return reject();
  return value;
}
function identity(value: unknown): string {
  if (typeof value !== 'string' || !value || value.length > 200 || value.trim() !== value || /[\u0000-\u001f]/.test(value)) return reject();
  return value;
}
function day(value: unknown): string {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return reject();
  const parsed = new Date(`${value}T12:00:00Z`);
  if (!Number.isFinite(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== value) reject();
  return value;
}
export function checkBackupSize(json: string): void {
  if (typeof json !== 'string' || json.length > limit) throw Error('Progress backup exceeds the 16 MiB limit.');
  let bytes = 0;
  for (const character of json) {
    const cp = character.codePointAt(0)!;
    bytes += cp <= 0x7f ? 1 : cp <= 0x7ff ? 2 : cp <= 0xffff ? 3 : 4;
    if (bytes > limit) throw Error('Progress backup exceeds the 16 MiB limit.');
  }
}
export function validateValue(key: unknown, value: unknown): string {
  if (typeof value !== 'string' || value.length > 2048) return reject();
  const parsed: unknown = JSON.parse(value);
  if (key === 'settings') {
    const optional = ['speechView', 'groupSize', 'crazyWpm', 'originalTextSize', 'translationTextSize', 'originalTextFont', 'translationTextFont'].filter(key => parsed && typeof parsed === 'object' && Object.hasOwn(parsed, key));
    object(parsed, ['mode', 'rate', ...optional]);
    return JSON.stringify(decodeSettings(value));
  } else if (key === 'selection') {
    const optional = parsed && typeof parsed === 'object' && Object.hasOwn(parsed, 'packageKey');
    const selection = object(parsed, optional ? ['language', 'book', 'packageKey'] : ['language', 'book']);
    if (!languages.some(language => language.id === selection.language)) reject();
    if (selection.book !== null) identity(selection.book);
    if (optional) { identity(selection.packageKey); if (selection.book === null) reject(); }
    return JSON.stringify({ language: selection.language, book: selection.book,
      ...(optional ? { packageKey: selection.packageKey } : {}) });
  } else reject();
}
const compound = (row: Row, fields: readonly string[]) => JSON.stringify(fields.map(field => row[field]));

export function validateProgressBackup(json: string): ProgressBackup {
  checkBackupSize(json);
  const parsedRoot = JSON.parse(json);
  const root = object(parsedRoot, parsedRoot?.version === 4 ? ['version', 'tables', 'sync'] : ['version', 'tables']);
  if (root.version !== 1 && root.version !== 2 && root.version !== 3 && root.version !== 4) reject();
  const modern = root.version === 4;
  const tableNames = Object.keys(columns).filter(table => (root.version !== 1 || table !== 'cycle_credits') && (Number(root.version) >= 3 || table !== 'unit_credits'));
  const tables = object(root.tables, tableNames);
  const result = { version: 4, tables: {} } as ProgressBackup;
  for (const table of Object.keys(columns) as Table[]) {
    const input = !tableNames.includes(table) ? [] : tables[table];
    if (!Array.isArray(input) || input.length > 100000) return reject();
    const seen = new Set<string>();
    result.tables[table] = input.map(value => {
      const original = object(value, columns[table]);
      const row: Row = {};
      for (const column of columns[table]) {
        const cell = original[column];
        if (column === 'stage') row[column] = integer(cell, 1, 16);
        else if (column === 'xp') { if (cell !== 0 && cell !== 10) reject(); row[column] = cell as number; }
        else if (column === 'day') row[column] = table === 'cycle_credits' && cell === '' ? '' : day(cell);
        else if (column === 'phrase_count') row[column] = integer(cell, 1, 100000);
        else if (column === 'phrase') row[column] = integer(cell, 0, 99999);
        else if (column === 'confirmed') row[column] = integer(cell, 0, 100000);
        else if (column === 'credited') row[column] = integer(cell, 0, MAX_XP);
        else if (column === 'completed_at') {
          if (typeof cell !== 'string' || !/^\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?Z?$/.test(cell)) reject();
          day((cell as string).slice(0, 10));
          const timestamp = (cell as string).replace(' ', 'T').replace(/Z?$/, 'Z');
          if (!Number.isFinite(Date.parse(timestamp)) || Number(timestamp.slice(11, 13)) > 23 || Number(timestamp.slice(14, 16)) > 59 || Number(timestamp.slice(17, 19)) > 59) reject();
          row[column] = cell as string;
        } else if (column === 'state') {
          if (typeof cell !== 'string' || cell.length > 4 * 1024 * 1024) reject();
          const parsed = JSON.parse(cell as string);
          if (table === 'unit_credits') {
            if (!validUnitCredit(parsed, Number(original.stage))) reject();
            row[column] = JSON.stringify(parsed); continue;
          }
          const s = object(parsed, ['version', 'runId', 'stage', 'phraseCount', 'phrase', 'mode', 'rate', 'confirmed', 'planned', 'phase', 'running', 'audioSeconds', 'remainingMs', ...(parsed?.version === 2 ? ['sourcePhraseCount', 'groupSize'] : []), ...(Number(root.version) >= 3 && parsed?.unitProgress !== undefined ? ['unitProgress'] : []), ...(parsed?.reveal !== undefined ? ['reveal'] : []), ...(Number(root.version) >= 4 ? ['sourceProgress', 'lineage'].filter(key => parsed?.[key] !== undefined) : [])]);
          integer(s.phraseCount, 1, 100000); integer(s.planned, isRevealStage(Number(original.stage)) ? 1 : 3, 100000); integer(s.confirmed, 0, 100000);
          if (s.version === 2) integer(s.sourcePhraseCount, 1, 100000);
          identity(s.runId);
          const restored = restoreSession(cell as string, (s.version === 2 ? s.sourcePhraseCount : s.phraseCount) as number, original.stage as PlayableStage);
          row[column] = JSON.stringify(Object.fromEntries(Object.entries(restored).sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0)));
        } else if (column === 'value') row[column] = validateValue(original.key, cell);
        else row[column] = identity(cell);
      }
      const key = compound(row, keys[table]);
      if (seen.has(key)) reject();
      seen.add(key);
      return row;
    }).sort((a, b) => {
      const left = compound(a, columns[table]), right = compound(b, columns[table]);
      return left < right ? -1 : left > right ? 1 : 0;
    });
  }
  const { checkpoints, completions, daily_stages, stage_awards, study_days, cycle_credits } = result.tables;
  const completed = new Set(completions.map(row => compound(row, ['stage', 'run'])));
  const history = new Set(completions.map(row => compound(row, ['package', 'stage', 'run'])));
  for (const checkpoint of checkpoints) {
    const s = JSON.parse(String(checkpoint.state));
    if (s.phase === 'complete' && !history.has(JSON.stringify([checkpoint.package, checkpoint.stage, s.runId]))) reject();
  }
  const daily = new Map(daily_stages.map(row => [compound(row, ['language', 'book', 'day']), row]));
  const study = new Set(study_days.map(row => compound(row, ['language', 'day'])));
  const counts = new Map<string, number>();
  const usedDaily = new Set<string>(), usedStudy = new Set<string>();
  for (const award of stage_awards) {
    const dailyKey = compound(award, ['language', 'book', 'day']);
    const studyKey = compound(award, ['language', 'day']);
    const chosen = daily.get(dailyKey);
    if (!chosen || !study.has(studyKey) || !completed.has(compound(award, ['stage', 'run']))) reject();
    usedDaily.add(dailyKey); usedStudy.add(studyKey);
    if (award.xp === 10) {
      const count = (counts.get(dailyKey) ?? 0) + 1;
      if (!modern && (chosen.stage !== award.stage || count > dailyLimit(Number(chosen.stage)))) reject();
      counts.set(dailyKey, count);
    }
  }
  const bindings = new Map<string, string>();
  const frontiers = new Map(cycle_credits.map(row => [compound(row, ['package', 'stage', 'run']), row]));
  const unitCredits = new Map(result.tables.unit_credits.map(row => [compound(row, ['package', 'stage', 'run']), JSON.parse(String(row.state)) as UnitCredit]));
  for (const [key, ledger] of unitCredits) {
    const row = frontiers.get(key);
    if (!row || row.phrase_count !== ledger.counts.length || row.credited !== ledger.baseline + ledger.earned
      || ledger.counts[Number(row.phrase)]! < Number(row.confirmed)) reject();
    if (history.has(key) && ledger.counts.some(count => count < (isRevealStage(Number(row.stage)) ? 1 : 3))) reject();
  }
  for (const row of cycle_credits) {
    const ledger = unitCredits.get(compound(row, ['package', 'stage', 'run']));
    if (!validCycleIdentity(String(row.package), { language: String(row.language), book: String(row.book) })
      || String(row.run).length > 100 || Number(row.phrase) >= Number(row.phrase_count)
      || (!ledger && Number(row.credited) > (Number(row.phrase) * 100000 + Number(row.confirmed)) * (isRevealStage(Number(row.stage)) ? 3 : Number(row.stage) >= 7 && Number(row.stage) <= 10 ? 4 : 1))) reject();
    const binding = compound(row, ['language', 'book']);
    const existing = bindings.get(String(row.package));
    if (existing && existing !== binding) reject();
    bindings.set(String(row.package), binding);
    const isComplete = history.has(compound(row, ['package', 'stage', 'run']));
    const minConfirmed = isRevealStage(Number(row.stage)) ? 1 : 3;
    if (isComplete && (row.phrase !== Number(row.phrase_count) - 1 || Number(row.confirmed) < minConfirmed || (!modern && minConfirmed === 3 && Number(row.confirmed) % 2 !== 1))) reject();
    if (row.day) {
      const studyKey = compound(row, ['language', 'day']);
      if (!isComplete || !study.has(studyKey) || row.phrase !== Number(row.phrase_count) - 1 || Number(row.confirmed) < minConfirmed) reject();
      usedStudy.add(studyKey);
    } else if (isComplete && Number(row.credited) > 0) reject();
  }
  for (const checkpoint of checkpoints) {
    const s = JSON.parse(String(checkpoint.state));
    const row = frontiers.get(JSON.stringify([checkpoint.package, checkpoint.stage, s.runId]));
    const ledger = unitCredits.get(JSON.stringify([checkpoint.package, checkpoint.stage, s.runId]));
    if (ledger && (ledger.sourceCount !== (s.version === 2 ? s.sourcePhraseCount : s.phraseCount)
      || ledger.groupSize !== (s.version === 2 ? s.groupSize : 1)
      || unitProgress(s).some((unit, i) => unit.confirmed > ledger.counts[i]!))) reject();
    if (s.unitProgress && row && !ledger) reject();
    if (!ledger && row && (row.phrase_count !== s.phraseCount || Number(row.phrase) < s.phrase
      || (row.phrase === s.phrase && Number(row.confirmed) < s.confirmed))) reject();
    if (!modern && row?.day && s.phase === 'complete' && (row.phrase !== s.phrase || row.confirmed !== s.confirmed)) reject();
  }
  if (!modern && (usedDaily.size !== daily.size || usedStudy.size !== study.size)) reject();
  result.sync = modern ? validateSync(root.sync, result.tables) : seedLedger(result.tables);
  result.sync = canonicalLedger(result.sync);
  // Validation above still checks the original version's accounting invariants.
  // The v4 projection has one canonical split; provenance lives in sync.runs.
  const totals = new Map(result.sync.runs.map(run => [runKey(run), creditTotal(run)]));
  for (const row of result.tables.unit_credits) {
    const ledger = JSON.parse(String(row.state)) as UnitCredit;
    row.state = JSON.stringify({ counts: ledger.counts, sourceCount: ledger.sourceCount, groupSize: ledger.groupSize,
      baseline: totals.get(runKey(row))!, earned: 0 });
  }
  return result;
}

function validateSync(value: unknown, tables: Record<Table, Row[]>): SyncLedger {
  const raw = object(value, ['clocks', 'runs']);
  if (!raw.clocks || typeof raw.clocks !== 'object' || Array.isArray(raw.clocks)) reject();
  const clocks: Record<string, string> = {};
  const permitted = new Set([...tables.checkpoints.map(row => JSON.stringify(['checkpoint', row.package, row.stage])),
    ...tables.preferences.map(row => JSON.stringify(['preference', row.key]))]);
  for (const [key, stamp] of Object.entries(raw.clocks)) {
    if (!permitted.has(key) || typeof stamp !== 'string' || (stamp !== '' && !/^\d{16}:\d{10}:[a-z0-9]{1,100}$/.test(stamp))
      || (stamp && !Number.isSafeInteger(Number(stamp.split(':')[0])))) reject();
    clocks[key] = stamp;
  }
  if (Object.keys(clocks).length !== permitted.size || !Array.isArray(raw.runs) || raw.runs.length > 100000) reject();
  const seen = new Set<string>();
  let remainingCells = 4_000_000;
  const cyclesByKey = new Map(tables.cycle_credits.map(row => [runKey(row), row]));
  const unitsByKey = new Map(tables.unit_credits.map(row => [runKey(row), row]));
  const runs: SyncRun[] = raw.runs.map(value => {
    const run = object(value, ['package', 'stage', 'run', 'language', 'book', 'sourceCount', 'groupSize', 'observed', 'candidates', 'events',
      ...(value && typeof value === 'object' && Object.hasOwn(value, 'lineage') ? ['lineage'] : [])]);
    for (const key of ['package', 'run', 'language', 'book']) identity(run[key]);
    integer(run.stage, 1, 16); integer(run.sourceCount, 0, 100000); integer(run.groupSize, 0, 4);
    if ((run.sourceCount === 0) !== (run.groupSize === 0)) reject();
    if (run.lineage !== undefined && (identity(run.lineage) === run.run || Number(run.stage) < 7 || Number(run.stage) > 10 || !run.sourceCount)) reject();
    const counts = (value: unknown): number[] => {
      if (typeof value === 'string') {
        if (!value || value.length > 1_500_000 || !/^[1-9][0-9]*\*[0-9]+(?:,[1-9][0-9]*\*[0-9]+)*$/.test(value)) return reject();
        const groups = value.split(',').map(group => group.split('*').map(Number));
        let length = 0;
        for (const [n, count] of groups) { integer(n, 1, 100000); integer(count, 0, 100000); length += n!; }
        if (length > 100000 || length > remainingCells) return reject();
        const expanded = new Array<number>(length); let offset = 0;
        for (const [n, count] of groups) { expanded.fill(count!, offset, offset + n!); offset += n!; }
        value = expanded;
      }
      if (!Array.isArray(value) || value.length < 1 || value.length > 100000) return reject();
      remainingCells -= value.length;
      if (remainingCells < 0) return reject();
      return value.map(count => integer(count, 0, 100000));
    };
    const observed = counts(run.observed);
    if (run.sourceCount && observed.length !== Math.ceil(Number(run.sourceCount) / Number(run.groupSize))) reject();
    if (!Array.isArray(run.candidates) || !run.candidates.length || run.candidates.length > 100000 || !Array.isArray(run.events) || run.events.length > 100000) reject();
    const candidates = run.candidates.map(value => {
      const candidate = object(value, ['credited', 'counts']);
      const fence = counts(candidate.counts);
      if (fence.length !== observed.length || fence.some((count, i) => count > observed[i]!)) reject();
      return { credited: integer(candidate.credited, 0, MAX_XP), counts: fence };
    });
    const eventsSeen = new Set<string>();
    const events = run.events.map(value => {
      const event = object(value, ['unit', 'ordinal', 'day', ...['multiplier', 'weight', 'sources'].filter(key => value && typeof value === 'object' && Object.hasOwn(value, key))]);
      if (event.multiplier !== undefined && (event.multiplier !== 3 || !isRevealStage(Number(run.stage)))) reject();
      const unit = integer(event.unit, 0, observed.length - 1), ordinal = integer(event.ordinal, 1, 100000);
      if (event.weight !== undefined) {
        if (Number(run.stage) < 7 || Number(run.stage) > 10 || event.multiplier !== undefined) reject();
        integer(event.weight, 1, Math.min(Number(run.groupSize), Number(run.sourceCount) - unit * Number(run.groupSize)));
      }
      if (event.sources !== undefined) {
        if (Number(run.stage) < 7 || Number(run.stage) > 10 || !Array.isArray(event.sources)
          || event.sources.length !== (event.weight ?? Math.min(Number(run.groupSize), Number(run.sourceCount) - unit * Number(run.groupSize)))) reject();
        const sources = new Set<number>();
        for (const item of event.sources as unknown[]) {
          const source = object(item, ['source', 'ordinal']);
          const index = integer(source.source, unit * Number(run.groupSize), Math.min(Number(run.sourceCount), (unit + 1) * Number(run.groupSize)) - 1);
          integer(source.ordinal, 1, 100000);
          if (sources.has(index)) reject(); sources.add(index);
        }
      } else if (run.lineage !== undefined) reject();
      const key = JSON.stringify([unit, ordinal]);
      if (!run.sourceCount || ordinal > observed[unit]! || eventsSeen.has(key)) reject();
      eventsSeen.add(key);
      return { unit, ordinal, day: day(event.day), ...(event.multiplier === 3 ? { multiplier: 3 as const } : {}),
        ...(event.sources !== undefined ? { sources: (event.sources as { source: number; ordinal: number }[]).slice().sort((a, b) => a.source - b.source) } : {}),
        ...(event.weight !== undefined ? { weight: Number(event.weight) } : {}) };
    });
    const result: SyncRun = { package: String(run.package), stage: Number(run.stage), run: String(run.run), language: String(run.language), book: String(run.book),
      ...(run.lineage !== undefined ? { lineage: String(run.lineage) } : {}),
      sourceCount: Number(run.sourceCount), groupSize: Number(run.groupSize), observed, candidates, events };
    const key = runKey(result), row = cyclesByKey.get(key);
    if (seen.has(key) || !row || row.language !== result.language || row.book !== result.book || row.phrase_count !== observed.length || row.credited !== creditTotal(result)
      || observed[Number(row.phrase)]! < Number(row.confirmed)) reject();
    const unit = unitsByKey.get(key);
    if (unit) {
      const plan = JSON.parse(String(unit.state)) as UnitCredit;
      if (result.sourceCount !== plan.sourceCount || result.groupSize !== plan.groupSize || plan.counts.some((count, i) => count !== observed[i])) reject();
    }
    seen.add(key); return result;
  });
  if (seen.size !== tables.cycle_credits.length) reject();
  const byKey = new Map(runs.map(run => [runKey(run), run]));
  for (const run of runs) if (run.lineage) {
    const root = byKey.get(JSON.stringify([run.package, run.stage, run.lineage]));
    if (!root || root.lineage || root.sourceCount !== run.sourceCount || root.language !== run.language || root.book !== run.book
      || run.candidates.length !== 1 || run.candidates[0]!.credited !== 0) reject();
  }
  for (const row of tables.checkpoints) {
    const state = JSON.parse(String(row.state));
    if (state.lineage !== byKey.get(JSON.stringify([row.package, row.stage, state.runId]))?.lineage) reject();
  }
  return { clocks, runs };
}
