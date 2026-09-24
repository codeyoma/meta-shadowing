import { createReadStream } from 'node:fs';
import { copyFile, lstat, mkdir, mkdtemp, rename, rm, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readVideoPackage } from '../src/core/video-package';

async function sha256(file: string) {
  const hash = createHash('sha256');
  for await (const chunk of createReadStream(file)) hash.update(chunk);
  return hash.digest('hex');
}
export async function prepareVideo(zip: string, video: string, output: string): Promise<void> {
  let staging: string | undefined;
  try {
    for (const file of [zip, video]) {
      const info = await lstat(file);
      if (!info.isFile() || info.isSymbolicLink()) throw Error();
    }
    if (await lstat(output).then(() => true, () => false)) throw Error();
    const names = execFileSync('/usr/bin/unzip', ['-Z', '-1', zip], { maxBuffer: 2_000_000, stdio: ['ignore', 'pipe', 'pipe'] }).toString().trim().split('\n');
    if (names.filter(name => name === 'phrases.json').length !== 1) throw Error();
    const source = JSON.parse(execFileSync('/usr/bin/unzip', ['-p', zip, 'phrases.json'], { maxBuffer: 2_000_000, stdio: ['ignore', 'pipe', 'pipe'] }).toString());
    if (source.schema_version !== 1 || source.timestamp_unit !== 'seconds'
      || source.source_language !== 'en' || source.translation_language !== 'ko'
      || source.media?.split !== false || !Array.isArray(source.phrases)
      || source.phrases.some((p: { excluded: boolean }) => p.excluded !== false)) throw Error();
    const bytes = (await lstat(video)).size;
    const manifest = readVideoPackage(JSON.stringify({
      kind: 'video', schemaVersion: 1, id: 'video-practice', version: 1, title: 'Video practice',
      media: { file: 'video/source.mp4', bytes, sha256: source.media.sha256, duration: source.media.duration },
      phrases: source.phrases.map((p: { id: string; start: number; end: number; corrected_english: string; korean: string }) =>
        ({ id: p.id, start: p.start, end: p.end, text: p.corrected_english, translation: p.korean })),
    }))!.manifest;
    // Checkpoints belong to immutable media, timing and final text together.
    manifest.id = `video-${createHash('sha256').update(JSON.stringify({ media: manifest.media, phrases: manifest.phrases })).digest('hex').slice(0, 32)}`;
    if (await sha256(video) !== manifest.media.sha256) throw Error();
    await mkdir(dirname(output), { recursive: true });
    staging = await mkdtemp(join(dirname(output), '.video-prepare-'));
    await mkdir(join(staging, 'video'));
    const copied = join(staging, manifest.media.file);
    await copyFile(video, copied);
    if ((await lstat(copied)).size !== bytes || await sha256(copied) !== manifest.media.sha256) throw Error();
    await writeFile(join(staging, 'manifest.json'), JSON.stringify(manifest));
    await rename(staging, output); staging = undefined;
  } catch { throw Error('Video package preparation failed; no package published.'); }
  finally { if (staging) await rm(staging, { recursive: true, force: true }); }
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const [zip, video] = process.argv.slice(2);
  if (!zip || !video || process.argv.length !== 4) {
    console.error('Supply the lesson ZIP and original MP4.'); process.exitCode = 1;
  } else {
    prepareVideo(resolve(zip), resolve(video), fileURLToPath(new URL('../private/local-video', import.meta.url)))
      .then(() => console.log('Prepared local video package. Nothing uploaded.'))
      .catch(() => { console.error('Video package preparation failed.'); process.exitCode = 1; });
  }
}
