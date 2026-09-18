import { checkBackupSize, columns, encodeProgressBackup, validateProgressBackup } from './progress-backup-codec';

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
function size(json: string) { try { checkBackupSize(json); } catch { throw Error('progress-cloud-tooLarge'); } }
export function emptyProgress(): string {
  return JSON.stringify({ version: 4, tables: Object.fromEntries(Object.keys(columns).map(key => [key, []])), sync: { clocks: {}, runs: [] } });
}
export function encodeEnvelope(progress: string, generation: string): string {
  const canonical = encodeProgressBackup(validateProgressBackup(progress));
  if (!generation) return canonical;
  if (!uuid.test(generation)) throw Error('progress-cloud-corrupt');
  // Embed the already compressed canonical v4 encoding without expanding counts.
  const json = `{"version":5,"generation":${JSON.stringify(generation)},"progress":${canonical}}`;
  size(json); return json;
}
export function decodeEnvelope(json: string, headGeneration: string): { generation: string; progress: string } {
  size(json);
  let value: any;
  try { value = JSON.parse(json); } catch { throw Error('progress-cloud-corrupt'); }
  if (typeof value?.version === 'number' && value.version > 5) throw Error('progress-cloud-updateRequired');
  try {
    if (value?.version === 5) {
      if (Object.keys(value).sort().join(',') !== 'generation,progress,version' || typeof value.generation !== 'string'
        || !uuid.test(value.generation) || value.generation !== headGeneration || value.progress?.version !== 4) throw Error();
      return { generation: value.generation, progress: encodeProgressBackup(validateProgressBackup(JSON.stringify(value.progress))) };
    }
    if (headGeneration) throw Error();
    return { generation: '', progress: encodeProgressBackup(validateProgressBackup(json)) };
  } catch { throw Error('progress-cloud-corrupt'); }
}
