import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createSession, restoreSession } from './session';
import { Player } from './player';
import { revealLines, visibleReveal, changeRevealSpeed, revealPlayback, playerSpeed } from './word-reveal';

const phrase = { text: 'We go now.', translation: '지금 가요.' };
test('reveal retains whitespace/layout, accumulates words and orders languages without exposing the answer', () => {
  for (const stage of [11, 12, 13, 14, 15, 16] as const) {
    const lines = revealLines(phrase, stage);
    assert.deepEqual(lines.map(line => line.kind), stage < 13 ? ['target', 'translation'] : stage < 15 ? ['translation', 'target'] : ['translation']);
    assert.deepEqual(visibleReveal(lines, 0, 120).map(line => line.visibleText), lines.map(() => ''));
  }
  const lines = revealLines(phrase, 11);
  assert.deepEqual(visibleReveal(lines, 0.5, 120).map(line => line.visibleText), ['We', '']);
  assert.deepEqual(visibleReveal(lines, 1.5, 120).map(line => line.visibleText), ['We go now.', '']);
  assert.deepEqual(visibleReveal(lines, 2, 120).map(line => line.visibleText), ['We go now.', '지금']);
  assert.deepEqual(visibleReveal(lines, 2.5, 120).map(line => line.visibleText), ['We go now.', '지금 가요.']);
  const spaced = revealLines({ text: '  We\n go!', translation: '' }, 11);
  const shown = visibleReveal(spaced, 0.5, 120)[0]!;
  assert.equal(shown.spans.map(span => span.text).join(''), '  We\n go!');
  assert.equal(shown.visibleText, 'We');
});

test('speed selection preserves revealed word position and selects one fixed configured S level', () => {
  const initial = createSession({ runId: 'speed', stage: 13, phraseCount: 2, rate: 0.75, mode: 'manual' });
  const paused = { ...initial, phase: 'listening' as const, audioSeconds: 0.6 };
  const next = changeRevealSpeed(paused, 3, [150, 200, 250, 300]);
  assert.deepEqual(next.reveal, { speed: 3, wpm: 250 });
  assert.equal(next.audioSeconds, 0.36);
  assert.equal(next.rate, 0.75);
  assert.equal(next.confirmed, 0);
  assert.equal(playerSpeed(next).label, 'S3');
  assert.equal(playerSpeed(next).option, 'reveal');
  assert.equal(playerSpeed({ ...initial, stage: 1, reveal: undefined }).label, '0.75×');
  assert.throws(() => changeRevealSpeed({ ...paused, running: true }, 2));
  assert.throws(() => changeRevealSpeed(paused, 0 as 1));
});

test('silent playback pauses partial words, ignores inactive time and only manual confirmation completes the phrase', async t => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  let time = 0;
  const initial = createSession({ runId: 'silent', stage: 11, phraseCount: 1, mode: 'manual', rate: 3 });
  const saved: string[] = [];
  const media = revealPlayback([phrase], initial, seconds => player.audioEnded(seconds), () => time);
  const player = new Player(initial, media, state => saved.push(JSON.stringify(state)), () => time, () => {});
  t.after(() => player.dispose());
  await player.resume();
  time = 600; t.mock.timers.tick(600); player.tick(); player.pause();
  assert.equal(player.state.audioSeconds, 0.6);
  const restored = restoreSession(saved.at(-1)!, 1, 11);
  time += 90000; t.mock.timers.tick(90000); player.tick();
  assert.equal(player.state.audioSeconds, 0.6);
  assert.equal(player.state.phase, 'listening');
  assert.equal(restored.reveal?.speed, 1);
  await player.resume();
  time += 1400; t.mock.timers.tick(1400);
  assert.equal(player.state.phase, 'speaking');
  assert.equal(player.state.confirmed, 0);
  await player.confirm();
  assert.equal(player.state.confirmed, 1);
  assert.equal(player.state.audioSeconds, 0);
  assert.equal(player.state.reveal?.speed, 1);
  assert.equal(player.state.phase, 'complete');
});

test('next starts every silent-stage phrase immediately at the selected word cadence', async t => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  for (const stage of [11, 12, 13, 14, 15, 16] as const) {
    let time = 0;
    const initial = createSession({ runId: `immediate-${stage}`, stage, phraseCount: 2, mode: 'manual', rate: 1 });
    const media = revealPlayback([phrase, phrase], initial, seconds => player.audioEnded(seconds), () => time);
    const player = new Player(initial, media, () => {}, () => time, () => {});
    t.after(() => player.dispose());
    await player.resume();
    time = stage <= 14 ? 2000 : 800;
    t.mock.timers.tick(time);
    assert.equal(player.state.phase, 'speaking');
    const next = player.choose('next');
    await Promise.resolve();
    assert.equal(player.state.phrase, 1);
    assert.equal(player.state.running, true, `Stage ${stage} must not wait for an inter-phrase timer`);
    await next;
    assert.equal(player.state.unitProgress![0]!.confirmed, 1);
    time += 400; t.mock.timers.tick(400); player.tick();
    assert.equal(player.state.audioSeconds, 0.4);
    assert.equal(visibleReveal(revealLines(phrase, stage), player.state.audioSeconds, 150)[0]!.visibleText,
      stage <= 12 ? 'We' : '지금');
    player.pause();
  }
});

test('disposing silent playback cancels its completion and invalid positions never start a timer', async t => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const state = createSession({ runId: 'cancel', stage: 15, phraseCount: 1, rate: 1, mode: 'manual' });
  let ends = 0;
  const media = revealPlayback([phrase], state, () => ends++, () => 0);
  await assert.rejects(() => media.prepare(1, 0, 1));
  await assert.rejects(() => media.prepare(0, NaN, 1));
  await media.prepare(0, 0, 1);
  media.play(); media.dispose(); t.mock.timers.tick(10000);
  assert.equal(ends, 0);
});

test('reentering an already revealed pass does not hide its words or repeat the timer', async t => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const state = createSession({ runId: 'finished-reveal', stage: 16, phraseCount: 1, rate: 1, mode: 'manual' });
  const port = revealPlayback([phrase], state, seconds => player.audioEnded(seconds));
  const player = new Player({ ...state, phase: 'speaking' }, port, () => {}, () => 0, () => {});
  t.after(() => player.dispose());
  const entry = player.enter();
  t.mock.timers.tick(1000); await entry;
  assert.equal(player.state.phase, 'speaking');
  assert.equal(player.state.confirmed, 0);
});

test('a failed periodic save stops reveal and recovery resumes the same partial word without confirmation', async t => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  let time = 0, fail = false;
  const state = createSession({ runId: 'failed-save', stage: 13, phraseCount: 1, mode: 'manual', rate: 1 });
  const media = revealPlayback([phrase], state, seconds => player.audioEnded(seconds), () => time);
  const player = new Player(state, media, () => { if (fail) throw Error('fixture storage failure'); }, () => time, () => {});
  t.after(() => player.dispose());
  await player.resume();
  time = 600; t.mock.timers.tick(600); fail = true; player.tick();
  assert.equal(player.error, 'save');
  assert.equal(player.state.running, false);
  assert.equal(player.state.audioSeconds, 0.6);
  time += 10000; t.mock.timers.tick(10000); player.tick();
  assert.equal(player.state.phase, 'listening');
  assert.equal(player.state.confirmed, 0);
  fail = false; player.retrySave(); await player.resume();
  time += 200; t.mock.timers.tick(200); player.tick();
  assert.equal(player.state.audioSeconds, 0.8);
  assert.equal(player.state.confirmed, 0);
  assert.deepEqual(visibleReveal(revealLines(phrase, 13), player.state.audioSeconds, 150).map(line => line.visibleText), ['지금 가요.', '']);
});
