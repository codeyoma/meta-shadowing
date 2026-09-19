import type { LearningPackage } from './learning-context';

export function paidAction(input: {configured:boolean;ownership:'owned'|'notOwned'|'unknown';authorized:boolean;installed:boolean}) {
  if (!input.configured) return 'unavailable';
  if (input.ownership === 'notOwned') return 'purchase';
  if (!input.authorized || input.ownership !== 'owned') return 'verify';
  return input.installed ? 'study' : 'download';
}
export function readPaidPackage(json: unknown): (LearningPackage & {delivery:'appleHosted'}) | null {
  if (typeof json !== 'string' || json.length > 20_000_000) return null;
  try {
    const m = JSON.parse(json);
    const validFile = (p: {bytes:number;sha256:string}) => Number.isSafeInteger(p.bytes) && p.bytes > 0
      && p.bytes <= 50_000_000 && typeof p.sha256 === 'string' && /^[a-f0-9]{64}$/.test(p.sha256);
    if (m.id !== 'duo-33' || m.version !== 1 || typeof m.title !== 'string' || !m.title
      || !Array.isArray(m.phrases) || m.phrases.length !== 560
      || m.phrases.some((p: {file:string;bytes:number;sha256:string;text:string;translation:string;section:number},i:number) => !validFile(p)
        || p.file !== `audio/phrase-${String(i+1).padStart(3,'0')}.m4a`
        || typeof p.text !== 'string' || !p.text.trim() || typeof p.translation !== 'string' || !p.translation.trim()
        || !Number.isSafeInteger(p.section) || p.section < 1 || p.section > 45)
      || !Array.isArray(m.metadata) || m.metadata.length !== 4
      || new Set(m.metadata.map((p:{file:string}) => p.file)).size !== 4
      || m.metadata.some((p:{file:string;bytes:number;sha256:string}) => !validFile(p) || p.bytes > 20_000_000
        || !['cover.jpg','info.json','text.txt','syntax.json'].includes(p.file))
      || [...m.phrases,...m.metadata].reduce((sum:number,p:{bytes:number}) => sum+p.bytes,0) > 1_000_000_000) return null;
    return { language:'english',delivery:'appleHosted',manifest:m };
  } catch { return null; }
}
