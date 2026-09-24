import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, readFileSync, existsSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { execFileSync, spawnSync } from 'node:child_process';
import { prepareVideo } from './package-video';

test('private preparation preserves original bytes and final text; bad checksum never publishes', async () => {
  const root = mkdtempSync(join(tmpdir(), 'video-prepare-'));
  try {
    const data = Buffer.from('synthetic movie fixture');
    const video = join(root, 'source.mp4'); writeFileSync(video, data);
    const json = { schema_version: 1, timestamp_unit: 'seconds', source_language: 'en', translation_language: 'ko',
      media: { sha256: createHash('sha256').update(data).digest('hex'), duration: 20, split: false },
      phrases: [{ id: 'p1', start: 1, end: 2, corrected_english: 'Good morning.', korean: '좋은 아침.',
        source_korean: 'Wrong field.', excluded: false }] };
    writeFileSync(join(root, 'phrases.json'), JSON.stringify(json));
    execFileSync('/usr/bin/zip', ['-q', 'input.zip', 'phrases.json'], { cwd: root });
    const output = join(root, 'prepared');
    await prepareVideo(join(root, 'input.zip'), video, output);
    assert.deepEqual(readFileSync(join(output, 'video/source.mp4')), data);
    const result = JSON.parse(readFileSync(join(output, 'manifest.json'), 'utf8'));
    assert.equal(result.phrases[0].translation, '좋은 아침.');
    json.phrases[0]!.korean = '안녕하세요.';
    writeFileSync(join(root, 'phrases.json'), JSON.stringify(json));
    execFileSync('/usr/bin/zip', ['-q', 'changed.zip', 'phrases.json'], { cwd: root });
    await prepareVideo(join(root, 'changed.zip'), video, join(root, 'changed'));
    const changed = JSON.parse(readFileSync(join(root, 'changed/manifest.json'), 'utf8'));
    assert.notEqual(changed.id, result.id, 'Changed text must not reuse existing checkpoint identity');
    await assert.rejects(prepareVideo(join(root, 'input.zip'), video, output));
    writeFileSync(video, 'changed');
    await assert.rejects(prepareVideo(join(root, 'input.zip'), video, join(root, 'bad')));
    assert.equal(existsSync(join(root, 'bad')), false);
  } finally { rmSync(root, { recursive: true, force: true }); }
});
test('malformed ZIP errors never print private input paths', () => {
  const root = mkdtempSync(join(tmpdir(), 'private-video-'));
  try {
    const invalid = join(root, 'private-name.zip'), video = join(root, 'private-movie.mp4');
    writeFileSync(invalid, 'not a zip'); writeFileSync(video, 'movie');
    const result = spawnSync(process.execPath, ['--import', 'tsx', '--input-type=module', '--eval',
      `import { prepareVideo } from './scripts/package-video.ts';
       await prepareVideo(...process.argv.slice(1)).catch(() => { console.error('Preparation failed.'); process.exitCode = 1; });`,
      invalid, video, join(root, 'output')], { encoding: 'utf8' });
    assert.equal(result.status, 1);
    assert.equal(result.stderr.includes(root), false, result.stderr);
    assert.equal(result.stderr.includes('private-name'), false);
  } finally { rmSync(root, { recursive: true, force: true }); }
});
