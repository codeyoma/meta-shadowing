export type VideoManifest = {
  kind: 'video'; schemaVersion: 1; id: string; version: number; title: string;
  media: { file: 'video/source.mp4'; bytes: number; sha256: string; duration: number };
  phrases: { id: string; start: number; end: number; text: string; translation: string }[];
};
export type VideoPackage = { language: 'english'; delivery: 'localVideo'; manifest: VideoManifest };
export function readVideoPackage(json: unknown): VideoPackage | null {
  if (json == null) return null;
  try {
    if (typeof json !== 'string' || json.length > 2_000_000) throw Error();
    const m = JSON.parse(json) as VideoManifest;
    const text = (s: unknown): s is string => typeof s === 'string' && s.trim().length > 0 && s.length <= 10_000;
    if (!m || m.kind !== 'video' || m.schemaVersion !== 1
      || typeof m.id !== 'string' || !/^video-[a-z0-9]+(?:-[a-z0-9]+)*$/.test(m.id) || m.id.length > 80
      || !Number.isSafeInteger(m.version) || m.version < 1 || !text(m.title)
      || m.media?.file !== 'video/source.mp4' || !Number.isSafeInteger(m.media.bytes)
      || m.media.bytes <= 0 || m.media.bytes > 4_000_000_000
      || typeof m.media.sha256 !== 'string' || !/^[a-f0-9]{64}$/.test(m.media.sha256)
      || !Number.isFinite(m.media.duration) || m.media.duration <= 0
      || !Array.isArray(m.phrases) || !m.phrases.length || m.phrases.length > 1000) throw Error();
    const ids = new Set<string>();
    let end = 0;
    for (const p of m.phrases) {
      if (!p || !text(p.id) || ids.has(p.id) || !text(p.text) || !text(p.translation)
        || !Number.isFinite(p.start) || !Number.isFinite(p.end) || p.start < end
        || p.end <= p.start || p.end > m.media.duration) throw Error();
      ids.add(p.id); end = p.end;
    }
    return { language: 'english', delivery: 'localVideo', manifest: m };
  } catch { throw Error('Unsupported video package.'); }
}
export function videoStageAvailable(stage: number) { return stage === 1; }
