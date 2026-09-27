import test from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import { nativeHooks } from '../test-support/native-hooks';
import { nativeModules, nativeMotion } from '../test-support/native-render';
import { readSentenceAnalysis } from './sentence-analysis';
import { syntaxFixture, syntaxPhrases } from '../test-support/syntax-fixture';

test('analysis opens a separate dictionary on demand and preserves selection on close', async t => {
  const runtime = nativeHooks(); t.after(runtime.dispose);
  t.mock.timers.enable({ apis: ['setTimeout'] });
  let copied = '', copyFails = false;
  const errors: string[] = [];
  const requests: { id: string; term: string; resolve(): void; reject(error: Error): void }[] = [];
  const dismissed: string[] = [];
  const listeners = new Set<(state: string) => void>();
  const load = nativeModules({ react: runtime.hooks, 'react-native-reanimated': nativeMotion,
    'react-native': { View: 'View', Text: 'Text', ScrollView: 'ScrollView', Pressable: 'Pressable',
      Alert: { alert: (title: string) => errors.push(title) },
      useColorScheme: () => 'dark', useWindowDimensions: () => ({ fontScale: 1, height: 800 }),
      AppState: { currentState: 'active', addEventListener: (_: string, fn: (state: string) => void) => {
        listeners.add(fn); return { remove: () => listeners.delete(fn) };
      } } },
    '@/../modules/learning-dictionary': { dictionary: {
      words: (term: string) => term === '.' ? [] : [{ start: 0, end: term.length }],
      present: (id: string, term: string) => new Promise<void>((resolve, reject) => requests.push({ id, term, resolve, reject })),
      dismiss: async (id: string) => { dismissed.push(id); },
    } },
    'expo-clipboard': { setStringAsync: async (text: string) => {
      if (copyFails) throw Error('clipboard unavailable');
      copied = text; return true;
    } },
    'expo-image': { Image: 'Image' }, 'expo-font': { isLoaded: () => false },
    'expo-haptics': { ImpactFeedbackStyle: { Light: 'light' }, impactAsync: async () => {} },
    'expo-router': { usePathname: () => '/player-info' },
    expo: { requireOptionalNativeModule: () => null, requireNativeModule: () => ({ isEnabled: () => true }) },
  });
  const { SentenceRelationGraph } = load('components/sentence-relation-graph.tsx');
  const sentence = readSentenceAnalysis(JSON.stringify(syntaxFixture()), syntaxPhrases, 'en', [0])[0]!;
  const render = (active = true) => runtime.render(React.createElement(SentenceRelationGraph, { sentence, active }));
  const dictionary = () => runtime.flush().find(n => n.props.accessibilityLabel?.startsWith('사전 보기:'));
  render();
  const copyStyle = runtime.find('문장 복사').style({ pressed: false });
  assert.equal(copyStyle.alignSelf, 'stretch', 'Copy target follows the sentence row height');
  assert.equal(copyStyle.justifyContent, 'center', 'Icon stays vertically centered at any height');
  assert.equal(dictionary(), undefined);
  runtime.find('단어 1: Birds, 명사').onPress();
  assert.ok(runtime.find('사전 보기: Birds'));
  assert.equal(requests.length, 0, 'Selecting a word does not automatically open a drawer');
  assert.ok(runtime.find('Birds → fly: 주어 (nominal subject)'));
  const selectedContent = runtime.flush();
  const graphIndex = selectedContent.findIndex(n => n.props.accessibilityLabel === '문장 관계 그래프');
  const dictionaryIndex = selectedContent.findIndex(n => n.props.accessibilityLabel === '사전 보기: Birds');
  const explanationIndex = selectedContent.findIndex(n => n.props.accessibilityLabel === 'Birds → fly: 주어 (nominal subject)');
  assert.ok(graphIndex < dictionaryIndex && dictionaryIndex < explanationIndex,
    'Dictionary lookup follows the graph before relationship explanations, including accessibility reading order');
  await runtime.find('문장 복사').onPress();
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(copied, 'Birds fly.', 'Copy includes the full target sentence, not the selected token');
  assert.ok(runtime.find('문장 복사 완료'));
  assert.equal(runtime.find('단어 1: Birds, 명사').accessibilityState.selected, true);
  assert.equal(requests.length, 0, 'Copy does not open the dictionary');
  t.mock.timers.tick(1500);
  assert.ok(runtime.find('문장 복사'));
  copyFails = true;
  await runtime.find('문장 복사').onPress();
  await new Promise(resolve => setImmediate(resolve));
  assert.deepEqual(errors, ['문장을 복사하지 못했어요. 다시 시도해 주세요.']);
  assert.ok(runtime.find('문장 복사'), 'Failed copies never show success');
  assert.equal(runtime.find('단어 1: Birds, 명사').accessibilityState.selected, true);
  const opening = runtime.find('사전 보기: Birds').onPress();
  runtime.find('사전 보기: Birds').onPress();
  assert.equal(requests.length, 1, 'Repeated taps cannot stack multiple dictionaries');
  const first = requests[0]!;
  assert.equal(first.term, 'Birds');
  first.resolve(); await opening; await new Promise(resolve => setImmediate(resolve));
  assert.equal(runtime.find('단어 1: Birds, 명사').accessibilityState.selected, true);
  assert.ok(runtime.find('Birds → fly: 주어 (nominal subject)'));
  const stale = runtime.find('사전 보기: Birds').onPress();
  runtime.find('단어 2: fly, 동사').onPress();
  runtime.flush();
  assert.ok(dismissed.includes(requests[1]!.id));
  const secondOpen = runtime.find('사전 보기: fly').onPress();
  assert.equal(requests[2]!.term, 'fly');
  assert.notEqual(requests[2]!.id, first.id);
  requests[1]!.reject(Error('stale close')); await stale; await new Promise(resolve => setImmediate(resolve));
  assert.equal(runtime.find('사전 보기: fly').accessibilityState.disabled, true);
  requests[2]!.resolve(); await secondOpen; await new Promise(resolve => setImmediate(resolve));
  assert.equal(runtime.find('단어 2: fly, 동사').accessibilityState.selected, true,
    'Closing only the dictionary preserves the selected word');
  assert.ok(runtime.find('Birds → fly: 주어 (nominal subject)'));
  assert.equal(errors.length, 1, 'Stale dictionary failures never alert');
  const failed = runtime.find('사전 보기: fly').onPress();
  requests[3]!.reject(Error('unavailable')); await failed; await new Promise(resolve => setImmediate(resolve));
  assert.equal(errors.at(-1), '사전을 열지 못했어요. 다시 시도해 주세요.');
  assert.equal(runtime.find('사전 보기: fly').accessibilityState.disabled, false);
  runtime.find('단어 1: Birds, 명사').onPress();
  runtime.find('사전 보기: Birds').onPress();
  listeners.forEach(fn => fn('background'));
  assert.equal(dictionary(), undefined);
  assert.ok(dismissed.includes(requests.at(-1)!.id));
  listeners.forEach(fn => fn('active'));
  assert.equal(dictionary(), undefined, 'Foreground does not restore stale selection');
  runtime.find('단어 1: Birds, 명사').onPress();
  runtime.find('사전 보기: Birds').onPress();
  render(false);
  assert.equal(dictionary(), undefined, 'Blur removes dictionary before the outgoing screen disappears');
  assert.ok(dismissed.includes(requests.at(-1)!.id));
  render();
  assert.equal(dictionary(), undefined, 'Reopening starts with no word selected');
  runtime.find('단어 3: ., 문장 부호').onPress();
  assert.equal(dictionary(), undefined, 'Punctuation retains graph selection without an invalid lookup action');
  assert.equal(runtime.find('단어 3: ., 문장 부호').accessibilityState.selected, true);
});
