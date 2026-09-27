import test from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import { DatabaseSync } from 'node:sqlite';
import { ProgressProfiles, ProgressSync } from './progress-sync';
import type { ProgressCloud } from '../../modules/progress-cloud';
import { createSession } from './session';
import { nativeHooks } from '../test-support/native-hooks';
import { nativeModules, nativeMotion } from '../test-support/native-render';
import { syntaxFixture, syntaxPhrases } from '../test-support/syntax-fixture';
import { nativeOptionsStack } from '../test-support/native-options-stack';

test('analysis route fails closed on invalid entry, missing data, stale sessions and storage failure', async t => {
  const runtime = nativeHooks(), db = new DatabaseSync(':memory:');
  let storageFailed = false;
  const profiles = new ProgressProfiles(() => ({ exec: sql => db.exec(sql),
    run: (sql, ...args) => { db.prepare(sql).run(...args); },
    first: <T>(sql: string, ...args: (string | number)[]) => {
      if (storageFailed && sql.includes('FROM checkpoints')) throw Error('storage unavailable');
      return db.prepare(sql).get(...args) as T;
    }, all: <T>(sql: string, ...args: (string | number)[]) => db.prepare(sql).all(...args) as T[],
  }), () => 'profile');
  const sync = new ProgressSync(profiles, { stop: async () => {}, account: async () => ({ status: 'no-account' }) } as ProgressCloud);
  t.after(() => { storageFailed = false; runtime.dispose(); sync.dispose(); db.close(); });
  const pack = { language: 'english', packageKey: 'syntax-test-v1', manifest: {
    id: 'syntax-test', version: 1, title: 'Test', phrases: syntaxPhrases.map(p => ({ ...p,
      file: 'audio/one.m4a', bytes: 1, sha256: 'a'.repeat(64) })) } };
  const journal = profiles.current().journal;
  const checkpoint = createSession({ runId: 'analysis', stage: 11, phraseCount: 1, mode: 'manual', rate: 1 });
  journal.save(pack.packageKey, checkpoint, { language: 'english', book: pack.manifest.id });
  let params = { kind: 'analysis', stage: '11', package: pack.packageKey, phrase: '0', run: checkpoint.runId,
    profile: sync.getSnapshot().profile, authority: String(sync.getSnapshot().authority) };
  let payload: string | null = JSON.stringify(syntaxFixture()), permitted = true, closes = 0;
  let finishSyntaxRead!: () => void;
  const syntaxRead = new Promise<void>(resolve => { finishSyntaxRead = resolve; });
  let finishPackageCheck!: () => void;
  const packageCheck = new Promise<void>(resolve => { finishPackageCheck = resolve; });
  const requests: { id: string; term: string; resolve(): void }[] = [];
  const dismissed: string[] = [];
  const load = nativeModules({ react: runtime.hooks, 'react-native-reanimated': nativeMotion,
    '@/../modules/learning-dictionary': { dictionary: {
      words: (term: string) => [{ start: 0, end: term.length }],
      present: (id: string, term: string) => new Promise<void>(resolve => requests.push({ id, term, resolve })),
      dismiss: async (id: string) => { dismissed.push(id); },
    } },
    'expo-router/native-stack': nativeOptionsStack(runtime.hooks),
    'expo-router/react-navigation': { useIsFocused: () => true, useHeaderHeight: () => 56 },
    'expo-clipboard': { setStringAsync: async () => true },
    'react-native': { ActivityIndicator: 'ActivityIndicator', ScrollView: 'ScrollView', View: 'View', Text: 'Text', Pressable: 'Pressable', PlatformColor: (name: string) => name,
      AppState: { currentState: 'active', addEventListener: () => ({ remove() {} }) },
      useColorScheme: () => 'dark', useWindowDimensions: () => ({ fontScale: 1 }) },
    'expo-image': { Image: 'Image' }, 'expo-haptics': {}, 'expo-font': { isLoaded: () => false },
    expo: { requireOptionalNativeModule: () => null, requireNativeModule: () => ({}) },
    'expo-router': { useLocalSearchParams: () => params, usePathname: () => '/player-info',
      useFocusEffect: (fn: () => any) => runtime.hooks.useEffect(fn, [fn]), router: { back: () => closes++ },
      Stack: { Screen: 'Screen', Toolbar: Object.assign('Toolbar', { Button: 'ToolbarButton' }) } },
    '@/native/progress-sync': { getProgressSync: () => sync, startProgressSync: () => () => {} },
    '@/native/catalog': { selectedPackage: () => pack }, '@/native/package': { isInstalled: async () => { await packageCheck; return true; } },
    '@/native/package-availability': {},
    '@/native/paid-package': { isPaidDuo: () => false, mayUsePackage: () => permitted },
    '@/native/stage-access': { testStageAccess: async () => true },
    '@/../modules/learning-audio': { __esModule: true, default: null },
    '@/../modules/package-delivery': { __esModule: true, default: { sentenceSyntax: async () => { await syntaxRead; return payload; } } },
  });
  const Route = load('app/player-info.tsx').default, { ProgressProfile } = load('components/progress-profile.tsx');
  let entry = 0;
  const open = async () => {
    runtime.render(React.createElement(ProgressProfile, null, React.createElement(Route, { key: entry++ })));
    for (let i = 0; i < 3; i++) { await new Promise(resolve => setImmediate(resolve)); runtime.flush(); }
  };
  const unavailable = () => {
    assert.ok(!runtime.flush().some(n => n.type === 'ActivityIndicator'));
    const container = runtime.flush().find(n => n.type === 'ScrollView')!;
    assert.equal(container.props.contentContainerStyle.flexGrow, 1);
    assert.equal(container.props.contentContainerStyle.justifyContent, 'center');
    assert.ok(runtime.flush().some(n => typeof n.props.children === 'string'
      && n.props.children === '이 학습에서는 문장 분석을 지원하지 않아요.'));
    assert.ok(!runtime.flush().some(n => n.props.accessibilityLabel?.startsWith('문장 1 분석:')));
    assert.ok(!runtime.flush().some(n => n.props.accessibilityLabel?.startsWith('사전 보기:')));
    runtime.find('분석 닫기').onPress();
  };
  await open();
  assert.equal(runtime.flush().filter(n => n.type === 'ActivityIndicator').length, 1,
    'pending package verification must show loading, not an unavailable error');
  assert.ok(!runtime.flush().some(n => n.type === 'Text'));
  finishPackageCheck();
  for (let i = 0; i < 3; i++) { await new Promise(resolve => setImmediate(resolve)); runtime.flush(); }
  const loading = runtime.flush();
  assert.equal(loading.filter(n => n.type === 'ActivityIndicator').length, 1);
  assert.equal(runtime.find('문장 분석 로딩 중').accessibilityState.busy, true);
  assert.ok(!loading.some(n => n.type === 'Text'));
  finishSyntaxRead();
  for (let i = 0; i < 3; i++) { await new Promise(resolve => setImmediate(resolve)); runtime.flush(); }
  assert.ok(!runtime.flush().some(n => n.type === 'ActivityIndicator'));
  runtime.find('문장 2 분석: Fish swim.').onPress();
  runtime.find('단어 1: Fish, 명사').onPress();
  runtime.find('사전 보기: Fish').onPress();
  assert.equal(requests.at(-1)!.term, 'Fish');
  assert.ok(runtime.find('Fish → swim: 주어 (nominal subject)'));
  runtime.find('문장 목록으로 돌아가기').onPress();
  assert.ok(!runtime.flush().some(n => n.props.accessibilityLabel?.startsWith('사전 보기:')));
  assert.ok(dismissed.includes(requests.at(-1)!.id));
  runtime.find('문장 1 분석: Birds fly.').onPress();
  runtime.find('단어 2: fly, 동사').onPress();
  assert.deepEqual(journal.load(pack.packageKey, 11, 1), checkpoint);
  assert.equal(journal.progress.summary('english').xp, 0);
  params = { ...params, stage: '999' }; await open(); unavailable();
  params = { ...params, stage: '11' }; payload = null; await open(); unavailable();
  payload = '{'; await open(); unavailable();
  payload = JSON.stringify(syntaxFixture()); permitted = false; await open(); unavailable();
  permitted = true; await open(); runtime.find('문장 1 분석: Birds fly.');
  runtime.find('문장 1 분석: Birds fly.').onPress();
  runtime.find('단어 1: Birds, 명사').onPress();
  runtime.find('사전 보기: Birds').onPress();
  assert.equal(requests.at(-1)!.term, 'Birds');
  journal.save(pack.packageKey, { ...checkpoint, runId: 'replacement' }, { language: 'english', book: pack.manifest.id });
  sync.changed(); unavailable();
  assert.ok(dismissed.includes(requests.at(-1)!.id));
  params = { ...params, run: 'replacement' }; await open(); runtime.find('문장 1 분석: Birds fly.');
  storageFailed = true;
  assert.doesNotThrow(() => sync.changed()); unavailable();
  assert.equal(closes, 6);
  storageFailed = false; await open();
  runtime.find('문장 1 분석: Birds fly.').onPress();
  runtime.find('단어 1: Birds, 명사').onPress();
  runtime.find('사전 보기: Birds').onPress();
  const staleClose = requests.at(-1)!.resolve;
  await sync.accountChanged();
  unavailable();
  assert.ok(dismissed.includes(requests.at(-1)!.id));
  staleClose();
  assert.ok(!runtime.flush().some(n => n.props.accessibilityLabel?.startsWith('사전 보기:')));
  assert.equal(journal.progress.summary('english').xp, 0);
  assert.deepEqual(journal.load(pack.packageKey, 11, 1), { ...checkpoint, runId: 'replacement' });
});
