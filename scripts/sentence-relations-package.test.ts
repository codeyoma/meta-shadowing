import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { readSentenceAnalysis } from '../src/core/sentence-analysis';
import { relationsForToken } from '../src/core/sentence-relations';
import React from 'react';
import { nativeHooks } from '../src/test-support/native-hooks';
import { nativeModules, nativeMotion } from '../src/test-support/native-render';

const directory = process.env.SENTENCE_ANALYSIS_PACKAGE_DIR;
test('installed DUO analysis supports every token selection without escaping its sentence', { skip: !directory }, () => {
  // Read privately; failures deliberately omit source text and filesystem paths.
  let manifest: { phrases: { text: string }[] }, raw: string;
  try {
    manifest = JSON.parse(readFileSync(join(directory!, 'manifest.json'), 'utf8'));
    raw = readFileSync(join(directory!, 'syntax.json'), 'utf8');
  } catch { throw Error('private-analysis-fixture-unavailable'); }
  assert.equal(manifest.phrases.length, 560);
  const sentences = readSentenceAnalysis(raw, manifest.phrases, 'en', manifest.phrases.map((_, i) => i));
  assert.equal(sentences.length, 811);
  assert.equal(sentences.reduce((sum, s) => sum + s.tokens.length, 0), 8795);
  for (const sentence of sentences) for (let selected = 0; selected < sentence.tokens.length; selected++) {
    const result = relationsForToken(sentence, selected);
    assert.ok(result.connected.includes(selected));
    assert.equal(result.edges.length, sentence.tokens.filter((token, index) => token.head !== index
      && (index === selected || token.head === selected)).length);
    for (const edge of result.edges) {
      assert.ok(edge.head >= 0 && edge.head < sentence.tokens.length && edge.head !== edge.dependent);
      assert.ok(edge.dependent === selected || edge.head === selected);
      assert.equal(edge.head, sentence.tokens[edge.dependent]!.head);
      assert.equal(edge.label, sentence.tokens[edge.dependent]!.relation);
      assert.ok(edge.name.length > 0 && edge.explanation.length > 0);
    }
  }
  // Exercise the actual longest sentence without copying its private text into a fixture.
  const longest = sentences.reduce((a, b) => a.tokens.length >= b.tokens.length ? a : b);
  assert.equal(longest.tokens.length, 28);
  const runtime = nativeHooks();
  try {
    let scale = 1;
    const load = nativeModules({ react: runtime.hooks, 'react-native-reanimated': nativeMotion,
      'react-native': { ScrollView: 'ScrollView', View: 'View', Text: 'Text', Pressable: 'Pressable',
        AppState: { currentState: 'active' }, useColorScheme: () => 'dark', useWindowDimensions: () => ({ fontScale: scale }) },
      'expo-image': { Image: 'Image' }, 'expo-haptics': {}, 'expo-font': { isLoaded: () => false },
      expo: { requireOptionalNativeModule: () => null, requireNativeModule: () => ({}) },
      'expo-router': { usePathname: () => '/player-info' },
    });
    const { SentenceRelationGraph } = load('components/sentence-relation-graph.tsx');
    runtime.render(React.createElement(SentenceRelationGraph, { sentence: longest }));
    const controls = () => runtime.flush().filter(n => n.props.accessibilityRole === 'button');
    const arrows = () => runtime.flush().filter(n => n.type === 'Image' && n.props.source?.uri?.startsWith('data:image/svg+xml'));
    const attachmentPoints = () => arrows().flatMap(n => {
      const path = decodeURIComponent(n.props.source.uri).match(/<path d="M ([\d.e+-]+) ([\d.e+-]+) Q ([\d.e+-]+) ([\d.e+-]+) ([\d.e+-]+) ([\d.e+-]+)"/);
      assert.ok(path);
      return [n.props.style.left + Number(path[1]), n.props.style.left + Number(path[5])];
    });
    for (scale of [1, 3]) {
      let x = 0;
      controls().forEach(n => {
        const width = 90 * scale;
        n.props.onLayout({ nativeEvent: { layout: { x, width } } }); x += width + 8;
      });
      assert.equal(arrows().length, 27);
      const overviewAttachments = attachmentPoints();
      assert.equal(new Set(overviewAttachments.map(x => x.toFixed(4))).size, 54,
        'Incoming and outgoing endpoints never share the same attachment point');
      for (const arrow of arrows()) {
        assert.ok(arrow.props.style.top >= 24 * scale);
        assert.ok(!/NaN|Infinity/.test(decodeURIComponent(arrow.props.source.uri)));
      }
      for (let selected = 0; selected < longest.tokens.length; selected++) {
        controls()[selected]!.props.onPress();
        assert.equal(controls()[selected]!.props.accessibilityState.selected, true);
        assert.equal(arrows().length, 27);
        assert.deepEqual(attachmentPoints(), overviewAttachments, 'Focus preserves all endpoint positions');
        controls()[selected]!.props.onPress();
        assert.ok(arrows().every(n => n.props.style.opacity === 1));
      }
    }
  } finally { runtime.dispose(); }
});
