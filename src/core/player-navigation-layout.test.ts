import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { runInNewContext } from 'node:vm';
import React from 'react';
import ts from 'typescript';

// Evaluate the actual screen's returned JSX with a ready-session fixture.
// Native hosts remain named elements so we can inspect which controls belong
// to the scrolling viewport versus the stack header, without running audio/DB.
const source = ts.createSourceFile('player.tsx', readFileSync(new URL('../app/player.tsx', import.meta.url), 'utf8'), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
const screen = source.statements.find((node): node is ts.FunctionDeclaration => ts.isFunctionDeclaration(node) && node.name?.text === 'PlayerScreen')!;
const returned = screen.body!.statements.find(ts.isReturnStatement)!.expression!;
const compiled = ts.transpileModule(`module.exports = (${returned.getText(source)});`, {
  compilerOptions: { jsx: ts.JsxEmit.ReactJSX, module: ts.ModuleKind.CommonJS },
}).outputText;
type Element = React.ReactElement<Record<string, unknown>>;
const require = createRequire(import.meta.url);

function layout(accessReady = true) {
  const actions: string[] = [];
  const module = { exports: {} as Element };
  runInNewContext(compiled, {
    module, exports: module.exports, require, View: 'View', ScrollView: 'ScrollView', Pressable: 'Pressable',
    Stack: { Screen: 'Screen' }, PlayerHeaderProgress: 'PlayerHeaderProgress',
    Icon: 'Icon', Label: 'Label', Card: 'Card', ActionButton: 'ActionButton',
    Animated: { View: 'AnimatedView' }, SpeechContent: 'SpeechContent',
    CycleTimeline: 'CycleTimeline', PlayerControls: 'PlayerControls',
    state: { stage: 9, rate: 1.5, phrase: 1, phraseCount: 6, phase: 'listening', runId: 'test' },
    stage: 9, unavailable: false, accessReady, unitLabel: '학습 묶음', presented: [], speechView: 'list',
    c: {}, insets: { bottom: 0 }, duration: 0, motionActive: false, error: null,
    busy: false, xpGain: null, celebrating: false, CONTENT_ENTER: undefined,
    isFirstWordStage: () => false, completedUnitCount: () => 0,
    mainPlayerAction: () => 'resume', canOfferRepeat: () => false,
    openInfo: (kind: string) => actions.push(kind),
    openOptions: (kind = 'options') => actions.push(kind),
  });
  return { root: module.exports, actions };
}

function descendants(node: unknown): Element[] {
  if (Array.isArray(node)) return node.flatMap(descendants);
  if (!React.isValidElement<Record<string, unknown>>(node)) return [];
  return [node, ...descendants(node.props.children)];
}

test('all three learning navigation controls stay in the fixed header, outside the scrolling body', () => {
  const { root, actions } = layout();
  const nodes = descendants(root);
  const scrolling = nodes.find(node => node.type === 'ScrollView')!;
  assert.equal(descendants(scrolling).filter(node => node.type === 'Pressable').length, 0);
  const stack = nodes.find(node => node.type === 'Screen')!;
  const header = (stack.props.options as { header(): Element }).header();
  const buttons = descendants(header).filter(node => node.type === 'Pressable');
  assert.equal(buttons.length, 3);
  for (const button of buttons) {
    assert.ok((button.props.style as { minHeight: number }).minHeight >= 44);
    (button.props.onPress as () => void)();
  }
  assert.deepEqual(actions, ['guide', 'rate', 'analysis']);
});

test('pending paid reauthorization hides existing sentences, playback and navigation controls', () => {
  const nodes = descendants(layout(false).root);
  assert.equal(nodes.some(node => node.type === 'SpeechContent' || node.type === 'PlayerControls'), false);
  const stack = nodes.find(node => node.type === 'Screen')!;
  const header = (stack.props.options as { header(): Element }).header();
  assert.equal(descendants(header).filter(node => node.type === 'Pressable').length, 0);
  assert.ok(nodes.some(node => node.type === 'Label' && node.props.children === '레슨을 여는 중…'));
});

test('player updates clear subtitle reveal when leaving a unit, even when later returning to it', () => {
  let construction: ts.NewExpression | undefined;
  function find(node: ts.Node) {
    if (ts.isNewExpression(node) && node.expression.getText(source) === 'Player') construction = node;
    ts.forEachChild(node, find);
  }
  find(screen);
  const callback = construction!.arguments![4]!;
  const code = ts.transpileModule(`module.exports = (${callback.getText(source)});`, {
    compilerOptions: { module: ts.ModuleKind.CommonJS },
  }).outputText;
  let reveal: string | null = 'run:2';
  const player = { state: { runId: 'run', phrase: 2 }, error: null };
  const module = { exports: undefined as unknown as () => void };
  runInNewContext(code, { module, player, active: true, shown: null, audio: {},
    setState() {}, setError() {}, setDuration() {},
    setRevealedKey: (update: (key: string | null) => string | null) => { reveal = update(reveal); },
  });
  module.exports(); assert.equal(reveal, 'run:2');
  player.state.phrase = 0; module.exports(); assert.equal(reveal, null);
  player.state.phrase = 2; module.exports(); assert.equal(reveal, null);
  reveal = 'run:2'; player.state.runId = 'new-run'; module.exports(); assert.equal(reveal, null);
});
