import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { Journal } from './journal';
import { LearningContext } from './learning-context';
import { readVideoPackage } from './video-package';
import { createSession, type Session } from './session';
import { Player } from './player';
import { canOfferRepeat, mainPlayerAction } from './player-presentation';
import { changeRevealSpeed, revealLines, revealPlayback, visibleReveal } from './word-reveal';

for (const stage of [11, 12, 13, 14, 15, 16] as const) {
  test(`video stage ${stage} preserves final text, fixed speed and single-pass credits across database reopen`, async t => {
    t.mock.timers.enable({ apis: ['setTimeout'] });
    const directory = mkdtempSync(join(tmpdir(), 'video-silent-test-'));
    let db = new DatabaseSync(join(directory, 'progress.db'));
    let player: Player | undefined;
    t.after(() => { player?.dispose(); db.close(); rmSync(directory, { recursive: true, force: true }); });
    const pack = readVideoPackage(JSON.stringify({ kind: 'video', schemaVersion: 1, id: 'video-silent', version: 1,
      title: 'Generated silent practice', media: { file: 'video/source.mp4', bytes: 10, sha256: 'a'.repeat(64), duration: 30 },
      phrases: [
        { id: 'first', start: 5, end: 15, text: '  We\n  go, now! ', translation: ' 지금  가요. ' },
        { id: 'second', start: 20, end: 29, text: 'Come back.', translation: '다시 와요.' },
      ] }))!;
    const openJournal = () => new Journal({ exec: sql => db.exec(sql),
      run: (sql, ...args) => { db.prepare(sql).run(...args); },
      first: <T>(sql: string, ...args: (string | number)[]) => db.prepare(sql).get(...args) as T | null });
    let journal = openJournal(), context = new LearningContext(pack, journal), time = 0;
    const initial = changeRevealSpeed(createSession({ runId: `silent-${stage}`, stage, phraseCount: 2, rate: 3, mode: 'manual' }),
      3, [100, 150, 200, 250]);
    const units = context.units(initial);
    assert.deepEqual(units.map(unit => unit.sourceIndices), [[0], [1]]);
    const lines = revealLines(units[0]!, stage);
    assert.deepEqual(lines.map(line => line.text), stage <= 12 ? ['  We\n  go, now! ', ' 지금  가요. ']
      : stage <= 14 ? [' 지금  가요. ', '  We\n  go, now! '] : [' 지금  가요. ']);
    assert.deepEqual(visibleReveal(lines, 0, 200).map(line => line.visibleText), stage <= 14 ? ['', ''] : ['']);
    const start = (state: Session) => {
      const port = revealPlayback(context.units(state), state, seconds => player!.audioEnded(seconds), () => time);
      player = new Player(state, port, context.createWriter(state), () => time, () => {});
      return port;
    };
    const advance = (ms: number) => { time += ms; t.mock.timers.tick(ms); player!.tick(); };
    const port = start(initial);
    await player!.resume();
    assert.equal(port.duration!(), stage <= 14 ? 1.5 : 0.6, 'Reveal uses finalized text, not video duration or ASR timing');
    advance(450); player!.pause();
    assert.equal(context.load(stage)!.audioSeconds, 0.45);
    assert.deepEqual(visibleReveal(lines, 0.45, 200).map(line => line.visibleText),
      stage <= 12 ? ['We', ''] : stage <= 14 ? ['지금', ''] : ['지금']);
    assert.equal(journal.progress.summary('english').xp, 0);
    player!.dispose(); player = undefined; db.close();
    db = new DatabaseSync(join(directory, 'progress.db'));
    journal = openJournal(); context = new LearningContext(pack, journal);
    const restored = context.load(stage)!;
    assert.equal(restored.running, false);
    assert.equal(restored.audioSeconds, 0.45);
    assert.deepEqual(restored.reveal, { speed: 3, wpm: 200 });
    start(restored);
    advance(90000);
    assert.equal(player!.state.audioSeconds, 0.45, 'Background time does not reveal words');
    await player!.resume();
    advance(stage <= 14 ? 1050 : 150);
    assert.equal(player!.state.phase, 'speaking');
    assert.equal(canOfferRepeat(player!.state, null), false);
    assert.equal(mainPlayerAction(player!.state, null), 'next');
    assert.equal(journal.progress.summary('english').xp, 0);
    player!.pause(); player!.dispose();
    start(context.load(stage)!);
    const entry = player!.enter();
    advance(1000); await entry;
    assert.equal(player!.state.phase, 'speaking', 'Reentry retains the completed reveal without replay');
    assert.equal(journal.progress.summary('english').xp, 0);
    await player!.choose('next');
    assert.equal(journal.progress.summary('english').xp, 3);
    assert.equal(player!.state.phrase, 1);
    assert.equal(player!.state.running, true, 'Confirmation starts the next phrase without an inter-phrase delay');
    assert.deepEqual(player!.state.reveal, { speed: 3, wpm: 200 });
    await player!.choose('repeat'); await player!.choose('next');
    assert.equal(journal.progress.summary('english').xp, 3, 'Early or repeated actions cannot award another pass');
    advance(stage <= 14 ? 1200 : 600);
    await player!.choose('next');
    assert.equal(player!.state.phase, 'complete');
    assert.equal(journal.progress.summary('english').xp, 6);
    assert.equal(context.completions(stage), 1);
    player!.dispose(); player = undefined; db.close();
    db = new DatabaseSync(join(directory, 'progress.db'));
    journal = openJournal(); context = new LearningContext(pack, journal);
    const complete = context.load(stage)!;
    assert.equal(complete.phase, 'complete');
    assert.equal(context.save(complete), 0);
    assert.equal(journal.progress.summary('english').xp, 6);
    assert.equal(context.completions(stage), 1);
  });
}
