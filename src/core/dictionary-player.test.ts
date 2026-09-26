import assert from 'node:assert/strict';
import test from 'node:test';
import React from 'react';
import { DatabaseSync } from 'node:sqlite';
import { ProgressProfiles, ProgressSync } from './progress-sync';
import type { ProgressCloud } from '../../modules/progress-cloud';
import manifest from '../../assets/sample/manifest.json';
import { createGroupedSession, createSession } from './session';
import { isFirstWordStage, isGroupedStage, isRevealStage } from './catalog';
import { nativeModules, nativeMotion } from '../test-support/native-render';
import { nativeHooks } from '../test-support/native-hooks';

for (const stage of [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16] as const)
for (const incomplete of isRevealStage(stage) ? [false, true] : [false])
test(`stage ${stage} ${incomplete ? 'unfinished reveal ignores lookup' : 'lookup preserves progress and rejects background callbacks'}`, async t => {
  let milliseconds = 0;
  if (incomplete) {
    t.mock.timers.enable({ apis: ['setTimeout', 'setInterval', 'Date'] });
    t.mock.method(performance, 'now', () => milliseconds);
  }
  const runtime = nativeHooks(), db = new DatabaseSync(':memory:');
  const profiles = new ProgressProfiles(() => ({ exec: sql => db.exec(sql),
    run: (sql, ...args) => { db.prepare(sql).run(...args); },
    first: <T>(sql: string, ...args: (string | number)[]) => db.prepare(sql).get(...args) as T | undefined,
    all: <T>(sql: string, ...args: (string | number)[]) => db.prepare(sql).all(...args) as T[],
  }), () => 'profile');
  const sync = new ProgressSync(profiles, { stop: async () => {} } as ProgressCloud);
  t.after(() => { runtime.dispose(); sync.dispose(); db.close(); });
  let appState = 'background', plays = 0, permitted = true, finish: (() => void) | undefined;
  let ended: ((duration: number) => void) | undefined;
  const appListeners = new Set<(state: string) => void>(), lookups: string[] = [], alerts: string[] = [];
  let remote: ((event: unknown) => void) | undefined;
  let remoteRevision = '';
  const pack = { owned: true, packageKey: `${manifest.id}-v${manifest.version}`, manifest, language: 'english' };
  const initial = { runId: 'lookup', stage, rate: 1.25, mode: 'manual' as const };
  const checkpoint = { ...(isGroupedStage(stage)
    ? createGroupedSession({ ...initial, sourcePhraseCount: manifest.phrases.length, groupSize: 2 })
    : createSession({ ...initial, phraseCount: manifest.phrases.length })),
    phase: isRevealStage(stage) && !incomplete ? 'speaking' as const : 'listening' as const,
    audioSeconds: isRevealStage(stage) ? 0 : 1.5 };
  profiles.current().journal.save(pack.packageKey, checkpoint, { language: 'english', book: manifest.id });
  const saved = () => profiles.current().journal.load(pack.packageKey, stage, manifest.phrases.length);
  const navigation = { addListener: () => () => {}, isFocused: () => true };
  const tokenize = (text: string) => Array.from(new Intl.Segmenter(undefined, { granularity: 'word' }).segment(text))
    .filter(s => s.isWordLike).map(s => ({ start: s.index, end: s.index + s.segment.length }));
  const nativeView = ({ ref, ...props }: any) => {
    if (ref) ref.current = { measureInWindow: (callback: (...values: number[]) => void) => callback(0, 0, 300, 54) };
    return React.createElement('View', props);
  };
  const load = nativeModules({ react: runtime.hooks,
    'react-native': { View: nativeView, Text: 'Text', Pressable: 'Pressable', ScrollView: 'ScrollView', findNodeHandle: () => 1,
      AccessibilityInfo: { setAccessibilityFocus() {} }, Alert: { alert: (title: string) => alerts.push(title) },
      AppState: { get currentState() { return appState; }, addEventListener: (_: string, fn: (s: string) => void) => {
        appListeners.add(fn); return { remove: () => appListeners.delete(fn) };
      } }, useColorScheme: () => 'light', useWindowDimensions: () => ({ fontScale: 1 }) },
    'react-native-reanimated': { ...nativeMotion, default: { ...nativeMotion.default, Text: 'Text' } },
    'expo-font': { isLoaded: () => true }, 'expo-image': { Image: 'Image' },
    'expo-router': { usePathname: () => '/player', useLocalSearchParams: () => ({ stage: String(stage), package: pack.packageKey }),
      useFocusEffect: (fn: () => any) => runtime.hooks.useEffect(fn, [fn]), useNavigation: () => navigation,
      Stack: { Screen: 'Screen' }, router: { back() {}, push() {} } },
    'expo-router/react-navigation': { useHeaderHeight: () => 50, useNavigationState: () => null, useIsFocused: () => true },
    expo: { requireNativeView: () => 'Video' }, 'expo-crypto': { randomUUID: () => 'test-id' },
    'react-native-safe-area-context': { useSafeAreaInsets: () => ({ bottom: 0 }) },
    '@/native/progress-sync': { getProgressSync: () => sync, startProgressSync: () => () => {} },
    '@/native/catalog': { selectedPackage: () => pack }, '@/native/package': { isInstalled: async () => true },
    '@/native/paid-package': { isPaidDuo: () => false, mayUsePackage: () => permitted },
    '@/native/stage-access': { testStageAccess: async () => true }, '@/native/voice-monitor': { learningMonitorSupported: false, learningMonitor: () => undefined },
    '@/native/audio': { nativeAudio: (_: unknown, onEnd: typeof ended) => {
      assert(!isRevealStage(stage), 'Silent lookup must never allocate native audio');
      ended = onEnd;
      return { prepare: async () => {}, play() { plays++; }, pause() {}, position: () => 1.5, dispose() {} };
    } },
    '@/native/video': {}, '@/../modules/learning-audio': { __esModule: true, default: {
      addListener: (_: string, callback: typeof remote) => { remote = callback; return { remove() {} }; },
      beginLessonRemote: async () => {}, endLessonRemote: async () => {}, activateLessonRemote: async () => {},
      updateLessonRemote: async (_: string, revision: string) => { remoteRevision = revision; },
    } },
    '@/native/tap-feedback': { tapFeedback() {}, prepareLearningHaptics() {}, stopLearningHaptics() {} },
    '@/../modules/learning-dictionary': { dictionary: { words: tokenize, present: async (_: string, term: string) => {
      lookups.push(term); await new Promise<void>(resolve => { finish = resolve; });
    }, dismiss: async () => { finish?.(); } } },
  });
  const Route = load('app/player.tsx').default, { ProgressProfile } = load('components/progress-profile.tsx');
  runtime.render(React.createElement(ProgressProfile, null, React.createElement(Route)));
  await new Promise(resolve => setImmediate(resolve));
  runtime.flush();
  appState = 'active'; appListeners.forEach(fn => fn(appState)); runtime.flush();
  if (incomplete) {
    const assertInert = () => {
      const before = saved();
      for (const node of runtime.flush()) {
        if (node.type === 'Text') node.props.onPress?.();
        node.props.onAccessibilityAction?.({ nativeEvent: { actionName: 'lookup-0' } });
      }
      assert.deepEqual(saved(), before, 'A word touch cannot write or pause the checkpoint');
      assert.deepEqual(lookups, []);
      assert(!runtime.flush().some(n => n.props.accessibilityActions?.length), 'No lookup actions before Next');
    };
    assertInert(); // Paused, incomplete: enabled Play is not enabled Next.
    runtime.find('이어하기').onPress({ nativeEvent: { pageX: 0, pageY: 0 } });
    await new Promise(resolve => setImmediate(resolve)); runtime.flush();
    for (let step = 0; step < 2; step++) {
      const delta = stage >= 15 ? 750 : 2100;
      milliseconds += delta; t.mock.timers.tick(delta); runtime.flush();
      assert.equal(runtime.find('음성 재생 중').disabled, true);
      assert.equal(saved()?.audioSeconds, milliseconds / 1000);
      assertInert(); // Includes the first/second-language boundary.
    }
    appState = 'background'; appListeners.forEach(fn => fn(appState)); runtime.flush();
    assertInert(); // A paused partial word remains ineligible.
    appState = 'active'; appListeners.forEach(fn => fn(appState)); runtime.flush();
    runtime.find('이어하기').onPress({ nativeEvent: { pageX: 0, pageY: 0 } });
    await new Promise(resolve => setImmediate(resolve)); runtime.flush();
    // Public sample: ten English words plus five Korean units, or Korean only,
    // at S1's 150 WPM: 6 seconds for paired lines and 2 seconds for Korean only.
    const remaining = (stage >= 15 ? 2000 : 6000) - milliseconds - 1;
    milliseconds += remaining; t.mock.timers.tick(remaining); runtime.flush();
    assert.equal(runtime.find('음성 재생 중').disabled, true);
    assertInert();
    if (stage % 2 === 0) db.exec('PRAGMA query_only = ON');
    milliseconds++; t.mock.timers.tick(1); runtime.flush();
    if (stage % 2 === 0) {
      assertInert(); // Completed ink is not enough when the checkpoint failed.
      assert.equal(runtime.find('오류 복구 후 이어하기').disabled, false);
      assert.equal(saved()?.phase, 'listening');
      db.exec('PRAGMA query_only = OFF');
      runtime.find('오류 복구 후 이어하기').onPress({ nativeEvent: { pageX: 0, pageY: 0 } });
      await new Promise(resolve => setImmediate(resolve));
      t.mock.timers.tick(0); runtime.flush(); // Flush an endpoint saved just before the ended callback.
    }
    assert.equal(runtime.find('다음 문장 또는 학습 마치기').disabled, false);
    assert.deepEqual(lookups, [], 'Ignored touches must never queue a later lookup');
    assert.equal(saved()?.confirmed, 0);
    const term = stage >= 15 ? '아침' : 'window';
    runtime.flush().find(n => n.props.children === term && n.props.onPress)!.props.onPress();
    assert.deepEqual(lookups, [term]);
    finish?.(); await new Promise(resolve => setImmediate(resolve)); runtime.flush();
    assert.equal(runtime.find('다음 문장 또는 학습 마치기').disabled, false);
    assert.equal(saved()?.confirmed, 0);
    assert.equal(plays, 0);
    return;
  }
  if (isFirstWordStage(stage)) runtime.find('자막 보기').onPress();
  const nodes = runtime.flush();
  const term = stage >= 15 ? '아침' : 'window';
  const word = nodes.find(node => node.props.children === term && node.props.onPress);
  assert.ok(word, 'The revealed original word is a tap target');
  await new Promise(resolve => setImmediate(resolve));
  const queuedRevision = remoteRevision;
  word.props.onPress();
  remote?.({ owner: 'test-id', revision: queuedRevision, action: 'main' });
  assert.deepEqual(lookups, [term]);
  const frozen = saved();
  assert.deepEqual(frozen, checkpoint);
  if (isRevealStage(stage)) {
    assert.equal(runtime.find('다음 문장 또는 학습 마치기').disabled, true);
    assert(!nodes.some(n => n.props.accessibilityLabel === '두 번 더 연습'));
    if (stage >= 15) assert(!nodes.some(n => n.props.children === 'window'));
    finish?.(); await new Promise(resolve => setImmediate(resolve)); runtime.flush();
    assert.equal(runtime.find('다음 문장 또는 학습 마치기').disabled, false);
    assert.deepEqual(saved(), checkpoint);
    const line = runtime.flush().find(n => n.props.accessibilityActions?.some((a: any) => a.label === `${term} 사전 찾기`))!;
    const action = line.props.accessibilityActions.find((a: any) => a.label === `${term} 사전 찾기`);
    line.props.onAccessibilityAction({ nativeEvent: { actionName: action.name } });
    assert.deepEqual(lookups, [term, term]);
    appState = 'background'; appListeners.forEach(fn => fn(appState));
    await new Promise(resolve => setImmediate(resolve)); runtime.flush();
    appState = 'active'; appListeners.forEach(fn => fn(appState)); runtime.flush();
    word.props.onPress();
    assert.equal(lookups.length, 2, 'A pre-background callback must not revive lookup');
    assert.deepEqual(saved(), checkpoint);
    assert.equal(plays, 0);
    const latestWord = runtime.flush().find(n => n.props.children === term && n.props.onPress)!;
    permitted = false;
    latestWord.props.onPress();
    assert.equal(lookups.length, 2, 'Revoked access rejects even a previously rendered word');
    assert.deepEqual(saved(), checkpoint);
    permitted = true;
    runtime.find('다음 문장 또는 학습 마치기').onPress({ nativeEvent: { pageX: 0, pageY: 0 } });
    latestWord.props.onPress();
    assert.equal(lookups.length, 2, 'Busy advancement rejects the old completed word immediately');
    await new Promise(resolve => setImmediate(resolve));
    assert.equal(saved()?.phrase, 1);
    assert(!runtime.flush().some(n => n.type === 'Text' && n.props.onPress), 'The next unfinished phrase disables lookup');
    return;
  }
  runtime.find('이어하기').onPress?.({ nativeEvent: { pageX: 0, pageY: 0 } });
  assert.equal(plays, 0, 'The footer cannot play behind the dictionary');
  finish?.(); await new Promise(resolve => setImmediate(resolve)); runtime.flush();
  if (isFirstWordStage(stage)) assert.equal(runtime.find('자막 숨기기').accessibilityState.expanded, true);
  assert.deepEqual(saved(), checkpoint);
  runtime.find('이어하기').onPress({ nativeEvent: { pageX: 0, pageY: 0 } });
  await new Promise(resolve => setImmediate(resolve));
  ended?.(2); runtime.flush();
  runtime.flush().find(n => n.props.children === 'window' && n.props.onPress)!.props.onPress();
  finish?.(); await new Promise(resolve => setImmediate(resolve)); runtime.flush();
  runtime.find('말했어요, 다음 사이클').onPress({ nativeEvent: { pageX: 0, pageY: 0 } });
  runtime.flush().find(n => n.props.children === 'window' && n.props.onPress)!.props.onPress();
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(saved()?.confirmed, 0,
    'A confirmation awaiting resume cannot continue behind a newly opened sheet');
  const count = lookups.length, beforePlays = plays;
  appState = 'background'; appListeners.forEach(fn => fn(appState));
  word.props.onPress();
  assert.equal(lookups.length, count);
  assert.equal(plays, beforePlays);
  assert.deepEqual(alerts, []);
});
