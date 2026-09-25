import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Player, type AudioPort } from './player';
import { createSession, type Session } from './session';
import { LearningDictionary } from './learning-dictionary';

test('word lookup saves the paused media position before presentation and dismissal never resumes', async () => {
  let saved: Session | undefined, finish!: () => void;
  let plays = 0;
  const audio: AudioPort = { prepare: async () => {}, play: () => { plays++; }, pause() {}, position: () => 1.75, dispose() {} };
  const player = new Player(createSession({ runId: 'dictionary', stage: 1, phraseCount: 2, mode: 'manual', rate: 0.75 }), audio,
    s => { saved = structuredClone(s); }, () => 0, () => {});
  await player.resume();
  const dictionary = new LearningDictionary({
    present: async (_id, term) => {
      assert.equal(term, 'window');
      assert.equal(saved?.running, false);
      assert.equal(saved?.audioSeconds, 1.75);
      await new Promise<void>(resolve => { finish = resolve; });
    }, dismiss: async () => {},
  }, () => ({ scope: 'unit', player, allowed: true, words: new Set(['window']) }), () => {});
  const lookup = dictionary.lookup('unit', 'window');
  assert.equal(dictionary.blocked, true);
  finish(); await lookup;
  assert.equal(dictionary.blocked, false);
  assert.equal(player.state.running, false);
  assert.equal(player.state.confirmed, 0);
  assert.equal(player.state.rate, 0.75);
  assert.equal(plays, 1);
  await player.resume();
  assert.equal(plays, 2);
  assert.equal(player.state.audioSeconds, 1.75);
});

test('cancellation during checkpointing cannot present a sheet afterward', async () => {
  let dictionary: LearningDictionary;
  let presentations = 0;
  const player = new Player(createSession({ runId: 'cancel-save', stage: 1, phraseCount: 2, mode: 'manual', rate: 1 }),
    { prepare: async () => {}, play() {}, pause() {}, position: () => 0, dispose() {} },
    () => { void dictionary.cancel(); }, () => 0, () => {});
  dictionary = new LearningDictionary({ present: async () => { presentations++; }, dismiss: async () => {} },
    () => ({ scope: 'unit', player, allowed: true, words: new Set(['word']) }), () => {});
  await dictionary.lookup('unit', 'word');
  assert.equal(presentations, 0);
});

test('invalidating a pending sheet blocks repeated taps until dismissal and rejects stale scopes', async () => {
  let finish!: () => void, close!: () => void, presentations = 0;
  const player = new Player(createSession({ runId: 'cancel', stage: 5, phraseCount: 2, mode: 'manual', rate: 1 }),
    { prepare: async () => {}, play() {}, pause() {}, position: () => 0, dispose() {} }, () => {}, () => 0, () => {});
  let scope = 'revealed', allowed = true;
  const dictionary = new LearningDictionary({ present: async () => {
    presentations++; await new Promise<void>(resolve => { finish = resolve; });
  }, dismiss: async () => { await new Promise<void>(resolve => { close = resolve; }); finish(); } },
  () => ({ scope, player, allowed, words: new Set(['visible']) }), () => {});
  const open = dictionary.lookup(scope, 'visible');
  await dictionary.lookup(scope, 'visible');
  allowed = false;
  const cancellation = dictionary.cancel();
  assert.equal(dictionary.blocked, true);
  allowed = true; scope = 'new-unit';
  await dictionary.lookup(scope, 'visible');
  assert.equal(presentations, 1);
  close(); await cancellation; await open;
  await dictionary.lookup('revealed', 'visible');
  await dictionary.lookup(scope, 'hidden');
  assert.equal(presentations, 1);
  assert.equal(player.state.confirmed, 0);
});

test('save and presentation failures keep learning paused and expose recovery without earning progress', async () => {
  let saved: Session | undefined, failSave = false, failPresentation = true, presentations = 0;
  const player = new Player(createSession({ runId: 'failure', stage: 6, phraseCount: 2, mode: 'manual', rate: 1.5 }),
    { prepare: async () => {}, play() {}, pause() {}, position: () => 2.5, dispose() {} },
    s => { if (failSave) throw Error('disk'); saved = structuredClone(s); }, () => 0, () => {});
  await player.resume();
  failSave = true;
  const dictionary = new LearningDictionary({ present: async () => { presentations++; if (failPresentation) throw Error('native'); }, dismiss: async () => {} },
    () => ({ scope: 'unit', player, allowed: true, words: new Set(['word']) }), () => {});
  await dictionary.lookup('unit', 'word');
  assert.equal(player.error, 'save');
  assert.equal(player.state.running, false);
  assert.equal(presentations, 0);
  failSave = false; player.retrySave();
  await assert.rejects(dictionary.lookup('unit', 'word'), /native/);
  assert.equal(dictionary.blocked, false);
  assert.equal(saved?.audioSeconds, 2.5);
  assert.equal(saved?.confirmed, 0);
  assert.equal(saved?.running, false);
  failPresentation = false;
  await dictionary.lookup('unit', 'word');
  assert.equal(presentations, 2);
  assert.equal(player.state.confirmed, 0);
});

test('lookup cancels pending entry and native preparation, preserving ended and extra-cycle decisions', async t => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  let plays = 0, prepareDone!: () => void;
  const audio: AudioPort = { prepare: () => new Promise<void>(resolve => { prepareDone = resolve; }),
    play() { plays++; }, pause() {}, position: () => 1.5, dispose() {} };
  const player = new Player(createSession({ runId: 'pending', stage: 1, phraseCount: 2, mode: 'manual', rate: 1 }),
    audio, () => {}, () => 0, () => {});
  const dictionary = new LearningDictionary({ present: async () => {}, dismiss: async () => {} },
    () => ({ scope: 'unit', player, allowed: true, words: new Set(['word']) }), () => {});
  const entry = player.enter();
  await dictionary.lookup('unit', 'word');
  t.mock.timers.tick(1000); await entry;
  assert.equal(plays, 0);
  const preparing = player.resume();
  await dictionary.lookup('unit', 'word');
  prepareDone(); await preparing;
  assert.equal(plays, 0);
  for (const phase of ['speaking', 'decision'] as const) {
    player.state = { ...player.state, phase, planned: 5, confirmed: 3, audioSeconds: 7, running: false,
      unitProgress: [{ confirmed: 3, planned: 5 }, { confirmed: 0, planned: 3 }] };
    const before = structuredClone(player.state);
    await dictionary.lookup('unit', 'word');
    assert.deepEqual(player.state, before);
  }
});
