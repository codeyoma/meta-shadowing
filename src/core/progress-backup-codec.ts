import { restoreSession } from './session';
import { decodeSettings } from './settings';
import { languages } from './catalog';
import { dailyLimit } from './progression';

export const columns = {
  checkpoints: ['package', 'stage', 'state'],
  completions: ['package', 'stage', 'run', 'completed_at'],
  daily_stages: ['language', 'book', 'day', 'stage'],
  stage_awards: ['language', 'book', 'run', 'day', 'stage', 'xp'],
  study_days: ['language', 'day'],
  preferences: ['key', 'value'],
} as const;
export type Table = keyof typeof columns;
export type Row = Record<string, string | number>;
export type ProgressBackup = { version: 1; tables: Record<Table, Row[]> };
const keys: Record<Table, readonly string[]> = {
  checkpoints: ['package', 'stage'], completions: ['package', 'stage', 'run'],
  daily_stages: ['language', 'book', 'day'], stage_awards: ['language', 'book', 'run'],
  study_days: ['language', 'day'], preferences: ['key'],
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
    object(parsed, ['mode', 'rate']);
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
  const root = object(JSON.parse(json), ['version', 'tables']);
  if (root.version !== 1) reject();
  const tables = object(root.tables, Object.keys(columns));
  const result = { version: 1, tables: {} } as ProgressBackup;
  for (const table of Object.keys(columns) as Table[]) {
    const input = tables[table];
    if (!Array.isArray(input) || input.length > 100000) return reject();
    const seen = new Set<string>();
    result.tables[table] = input.map(value => {
      const original = object(value, columns[table]);
      const row: Row = {};
      for (const column of columns[table]) {
        const cell = original[column];
        if (column === 'stage') row[column] = integer(cell, 1, table === 'checkpoints' ? 2 : 16);
        else if (column === 'xp') { if (cell !== 0 && cell !== 10) reject(); row[column] = cell as number; }
        else if (column === 'day') row[column] = day(cell);
        else if (column === 'completed_at') {
          if (typeof cell !== 'string' || !/^\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?Z?$/.test(cell)) reject();
          day((cell as string).slice(0, 10));
          const timestamp = (cell as string).replace(' ', 'T').replace(/Z?$/, 'Z');
          if (!Number.isFinite(Date.parse(timestamp)) || Number(timestamp.slice(11, 13)) > 23 || Number(timestamp.slice(14, 16)) > 59 || Number(timestamp.slice(17, 19)) > 59) reject();
          row[column] = cell as string;
        } else if (column === 'state') {
          if (typeof cell !== 'string' || cell.length > 4096) reject();
          const s = object(JSON.parse(cell as string), ['version', 'runId', 'stage', 'phraseCount', 'phrase', 'mode', 'rate', 'confirmed', 'planned', 'phase', 'running', 'audioSeconds', 'remainingMs']);
          integer(s.phraseCount, 1, 100000); integer(s.planned, 3, 100000); integer(s.confirmed, 0, 100000);
          identity(s.runId);
          const restored = restoreSession(cell as string, s.phraseCount as number, original.stage as 1 | 2);
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
  const { checkpoints, completions, daily_stages, stage_awards, study_days } = result.tables;
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
      if (chosen.stage !== award.stage || count > dailyLimit(Number(chosen.stage))) reject();
      counts.set(dailyKey, count);
    }
  }
  if (usedDaily.size !== daily.size || usedStudy.size !== study.size) reject();
  return result;
}
