import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { runInNewContext } from 'node:vm';
import React from 'react';
import ts from 'typescript';
import { PaidLearningAccess } from './paid-learning-access';
import { isVideoPackage } from './learning-context';
import { isRevealStage } from './catalog';
import { playerSpeed, revealPlayback } from './word-reveal';
import { createSession } from './session';
import type { AudioPort } from './player';

// Evaluate the actual screen's returned JSX with a ready-session fixture.
// Native hosts remain named elements so we can inspect which controls belong
// to the scrolling viewport versus the stack header, without running audio/DB.
const source = ts.createSourceFile('player.tsx', readFileSync(new URL('../app/player.tsx', import.meta.url), 'utf8'), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
const screen = source.statements.find((node): node is ts.FunctionDeclaration => ts.isFunctionDeclaration(node) && node.name?.text === 'PlayerScreen')!;
const returned = screen.body!.statements.find(ts.isReturnStatement)!.expression!;
const headerDeclaration = screen.body!.statements.filter(ts.isVariableStatement)
  .flatMap(node => [...node.declarationList.declarations]).find(node => node.name.getText(source) === 'headerOptions');
const compiled = ts.transpileModule(`module.exports = () => {
  ${headerDeclaration ? `const ${headerDeclaration.getText(source)};` : ''}
  return (${returned.getText(source)});
};`, {
  compilerOptions: { jsx: ts.JsxEmit.ReactJSX, module: ts.ModuleKind.CommonJS },
}).outputText;
type Element = React.ReactElement<Record<string, unknown>>;
const require = createRequire(import.meta.url);

function layout(accessReady = true, unavailable = false, accessDenied = false, rapid = false, refreshing = false, video = false) {
  const actions: string[] = [];
  const module = { exports: {} as unknown as () => Element };
  let memo: { dependencies: unknown[]; value: unknown } | undefined;
  runInNewContext(compiled, {
    module, exports: module.exports, require, View: 'View', ScrollView: 'ScrollView', Pressable: 'Pressable',
    Stack: { Screen: 'Screen' }, PlayerHeaderProgress: 'PlayerHeaderProgress',
    Icon: 'Icon', Label: 'Label', Card: 'Card', ActionButton: 'ActionButton',
    Animated: { View: 'AnimatedView' }, SpeechContent: 'SpeechContent', WordRevealContent: 'WordRevealContent',
    videoOwner: video ? 'test-video' : null, LessonVideo: 'LessonVideo',
    dictionary: { blocked: false, lookup: undefined, isBlocked: () => false },
    CycleTimeline: 'CycleTimeline', PlayerControls: 'PlayerControls',
    state: { stage: rapid ? 11 : 9, rate: 1.5, phrase: 1, phraseCount: 6, phase: 'listening', runId: 'test', ...(rapid ? { reveal: { speed: 3, wpm: 250 } } : {}) },
    stage: rapid ? 11 : 9, unavailable, accessReady, accessDenied, leave() {}, unitLabel: '학습 묶음', presented: [], speechView: 'list', units: [], textSettings: null,
    c: {}, insets: { bottom: 0 }, duration: 0, motionActive: false, error: null,
    busy: false, refreshing, xpGain: null, celebrating: false, CONTENT_ENTER: undefined,
    isFirstWordStage: () => false, completedUnitCount: () => 0, isRevealStage, playerSpeed,
    mainPlayerAction: () => 'resume', canOfferRepeat: () => false,
    openInfo: (kind: string) => actions.push(kind),
    openOptions: (kind = 'options') => actions.push(kind),
    useMemo: (factory: () => unknown, dependencies: unknown[]) => {
      if (!memo || dependencies.some((value, index) => value !== memo!.dependencies[index])) memo = { dependencies, value: factory() };
      return memo.value;
    },
  });
  return { root: module.exports(), render: module.exports, actions };
}

test('inline video precedes paired text and is absent from silent stages', () => {
  const nodes = descendants(layout(true, false, false, false, false, true).root);
  assert.ok(nodes.findIndex(n => n.type === 'LessonVideo') < nodes.findIndex(n => n.type === 'SpeechContent'));
  assert.equal(descendants(layout(true, false, false, true, false, true).root).some(n => n.type === 'LessonVideo'), false);
});

test('video stays fixed above the scrolling text while playback controls stay below it', () => {
  const root = layout(true, false, false, false, false, true).root;
  const nodes = descendants(root);
  const scrolling = nodes.find(node => node.type === 'ScrollView')!;
  const scrollingNodes = descendants(scrolling);
  assert.equal(nodes.filter(node => node.type === 'LessonVideo').length, 1);
  assert.equal(scrollingNodes.some(node => node.type === 'LessonVideo'), false);
  assert.equal(scrollingNodes.some(node => node.type === 'SpeechContent'), true);
  assert.equal(scrollingNodes.some(node => node.type === 'PlayerControls'), false);
  assert.ok(nodes.findIndex(node => node.type === 'LessonVideo') < nodes.indexOf(scrolling));
  assert.equal((scrolling.props.style as { flex: number }).flex, 1);

  for (const [ready, unavailable, denied] of [[false, false, false], [true, true, false], [true, false, true]]) {
    assert.equal(descendants(layout(ready, unavailable, denied, false, false, true).root)
      .some(node => node.type === 'LessonVideo'), false, 'Video is hidden until the lesson is available and authorized');
  }
});

test('video fills the screen width with square corners while text and controls keep their insets', () => {
  const root = layout(true, false, false, false, false, true).root;
  function horizontalInset(node: unknown, target: string, inset = 0): number | undefined {
    if (Array.isArray(node)) {
      for (const child of node) {
        const found = horizontalInset(child, target, inset);
        if (found !== undefined) return found;
      }
    }
    if (!React.isValidElement<Record<string, unknown>>(node)) return;
    const style = { ...(node.props.style as Record<string, number>), ...(node.props.contentContainerStyle as Record<string, number>) };
    const next = inset + (style.paddingHorizontal ?? style.padding ?? 0) + (style.marginHorizontal ?? style.margin ?? 0);
    return node.type === target ? next : horizontalInset(node.props.children, target, next);
  }
  assert.equal(horizontalInset(root, 'LessonVideo'), 0);
  assert.equal(horizontalInset(root, 'SpeechContent'), 24);
  assert.equal(horizontalInset(root, 'PlayerControls'), 24);
  assert.equal(horizontalInset(layout().root, 'SpeechContent'), 24);
  assert.equal(horizontalInset(layout(true, false, false, true).root, 'WordRevealContent'), 24);

  const videoSource = ts.createSourceFile('lesson-video.tsx', readFileSync(new URL('../components/lesson-video.tsx', import.meta.url), 'utf8'), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const component = videoSource.statements.find((node): node is ts.FunctionDeclaration => ts.isFunctionDeclaration(node) && node.name?.text === 'LessonVideo')!;
  const code = ts.transpileModule(`module.exports = () => ${component.body!.getText(videoSource)};`, {
    compilerOptions: { jsx: ts.JsxEmit.ReactJSX, module: ts.ModuleKind.CommonJS },
  }).outputText;
  const module = { exports: {} as unknown as () => Element };
  runInNewContext(code, { module, exports: module.exports, require, NativeVideo: 'NativeVideo' });
  const style = module.exports().props.style as Record<string, unknown>;
  assert.equal(style.borderRadius ?? 0, 0);
  assert.equal(style.aspectRatio, 16 / 9);
});

function descendants(node: unknown): Element[] {
  if (Array.isArray(node)) return node.flatMap(descendants);
  if (!React.isValidElement<Record<string, unknown>>(node)) return [];
  return [node, ...descendants(node.props.children)];
}

test('menu return keeps the paused lesson visible while local revalidation disables playback', async () => {
  const focus = screen.body!.statements.find(node => ts.isExpressionStatement(node)
    && ts.isCallExpression(node.expression) && node.expression.expression.getText(source) === 'useFocusEffect') as ts.ExpressionStatement;
  const callback = ((focus.expression as ts.CallExpression).arguments[0] as ts.CallExpression).arguments[0]!;
  const code = ts.transpileModule(`module.exports = (${callback.getText(source)});`, {
    compilerOptions: { module: ts.ModuleKind.CommonJS },
  }).outputText;
  const paused = { ...createSession({ runId: 'menu-return', stage: 11, phraseCount: 2, mode: 'manual', rate: 1 }), audioSeconds: 1.2 };
  for (const initial of [paused, null]) {
    let visible = initial, busy = false, refreshing = false, accessReady = false;
    let finish!: (installed: boolean) => void;
    const module = { exports: undefined as unknown as () => () => void };
    runInNewContext(code, { module, exports: {}, pack: {}, engine: { current: null }, paidGuard: { current: null },
      AppState: { currentState: 'active', addEventListener: () => ({ remove() {} }) },
      isPaidDuo: () => false, mayUsePackage: () => true,
      isInstalled: () => new Promise<boolean>(resolve => { finish = resolve; }),
      setState: (value: typeof initial) => { visible = value; },
      setBusy: (value: boolean) => { busy = value; },
      setRefreshing: (value: boolean) => { refreshing = value; },
      setAccessReady: (value: boolean) => { accessReady = value; },
      setMotionActive() {}, setCelebrating() {}, setXpGain() {},
      setUnavailable: () => assert.fail('An obsolete initialization updated the screen'),
      prepareLearningHaptics() {}, stopLearningHaptics() {}, sentenceEntry: { cancel() {} },
      dictionary: { cancel() {} },
      gainOrigin: { current: null }, clearInterval,
    });
    const cleanup = module.exports();
    assert.equal(visible, initial, 'Returning from a drawer must not replace existing content with loading');
    assert.equal(busy, false, 'A menu return must not trigger visible action loading');
    assert.equal(refreshing, true, 'The old frame is not actionable until the new engine is ready');
    const controls = descendants(layout(true, false, false, true, refreshing).root).find(node => node.type === 'PlayerControls')!;
    assert.equal(controls.props.blocked, true);
    assert.equal(controls.props.busy, false);
    assert.equal(accessReady, true);
    cleanup(); finish(false); await Promise.resolve();
  }
});

test('silent speed sheet exposes shared WPM editing only for authorized stages 11–16', () => {
  const optionsSource = ts.createSourceFile('player-options.tsx', readFileSync(new URL('../app/player-options.tsx', import.meta.url), 'utf8'), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const optionsScreen = optionsSource.statements.find((node): node is ts.FunctionDeclaration => ts.isFunctionDeclaration(node) && node.name?.text === 'PlayerOptionsScreen')!;
  const optionsReturn = optionsScreen.body!.statements.find(ts.isReturnStatement)!.expression!;
  const code = ts.transpileModule(`module.exports = () => (${optionsReturn.getText(optionsSource)});`, {
    compilerOptions: { jsx: ts.JsxEmit.ReactJSX, module: ts.ModuleKind.CommonJS },
  }).outputText;
  for (const [stage, authorized, expected] of [[10, true, false], [11, true, true], [16, true, true], [11, false, false]] as const) {
    const patches: unknown[] = [];
    const settings = { crazyWpm: [150, 200, 250, 350] };
    const module = { exports: undefined as unknown as () => Element };
    runInNewContext(code, { module, exports: {}, require, View: 'View', ScrollView: 'ScrollView', Stack: { Screen: 'Screen' },
      HeaderButton: 'HeaderButton', ActionButton: 'ActionButton', RevealSpeedControl: 'RevealSpeedControl',
      LearningPreferenceSection: 'LearningPreferenceSection', selected: 'reveal', c: {}, insets: { bottom: 0 },
      settings, checkpoint: { reveal: { speed: 2, wpm: 200 } }, stage, isRevealStage, revision: 0,
      scopeValid: () => authorized, changeSpeed: () => assert.fail('Editing presets changed the current run'),
      changePreference: (patch: unknown) => patches.push(patch),
    });
    const nodes = descendants(module.exports());
    const editor = nodes.find(node => node.type === 'LearningPreferenceSection' && node.props.option === 'wpm');
    assert.equal(!!editor, expected, `stage ${stage}, authorized ${authorized}`);
    if (editor) {
      assert.equal(editor.props.settings, settings);
      const patch = { crazyWpm: [175, 225, 275, 375] };
      (editor.props.onChange as (patch: unknown) => void)(patch);
      assert.deepEqual(patches, [patch]);
      assert.ok(nodes.findIndex(node => node.type === 'RevealSpeedControl') < nodes.indexOf(editor));
    }
  }
});

test('navigation-only rerenders preserve header options identity to avoid setOptions feedback loops', () => {
  const { root, render } = layout(true, false, false, true);
  const options = (node: Element) => descendants(node).find(child => child.type === 'Screen')!.props.options;
  assert.equal(options(root), options(render()));
});

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

test('silent stage header shows selected S level and opens reveal speed instead of audio rate', () => {
  const { root, actions } = layout(true, false, false, true);
  const nodes = descendants(root);
  const header = (nodes.find(node => node.type === 'Screen')!.props.options as { header(): Element }).header();
  const buttons = descendants(header).filter(node => node.type === 'Pressable');
  assert.match(String(buttons[1]!.props.accessibilityLabel), /S3.*250 WPM/);
  assert.ok(descendants(buttons[1]).some(node => node.type === 'Label' && node.props.children === 'S3'));
  (buttons[1]!.props.onPress as () => void)();
  assert.deepEqual(actions, ['reveal']);
  assert.ok(nodes.some(node => node.type === 'WordRevealContent'));
  assert.equal(nodes.some(node => node.type === 'SpeechContent'), false);
  assert.equal(nodes.some(node => node.type === 'CycleTimeline'), false, 'Silent stages have no cycle indicator');
  assert.equal(descendants(layout().root).some(node => node.type === 'CycleTimeline'), true, 'Audio stages keep their indicator');
});

test('all six silent video routes use only a clock, including native-free teardown', async () => {
  let declaration: ts.VariableDeclaration | undefined;
  function find(node: ts.Node) {
    if (ts.isVariableDeclaration(node) && node.name.getText(source) === 'audio') declaration = node;
    ts.forEachChild(node, find);
  }
  find(screen);
  const owner = screen.body!.statements.filter(ts.isVariableStatement)
    .flatMap(node => [...node.declarationList.declarations]).find(node => node.name.getText(source) === '[videoOwner]')!;
  const disposal = screen.body!.statements.find(node => ts.isExpressionStatement(node)
    && ts.isCallExpression(node.expression) && node.expression.expression.getText(source) === 'useEffect')!;
  const code = ts.transpileModule(`const ${owner.getText(source)};
    ${disposal.getText(source)}
    module.exports = (${declaration!.initializer!.getText(source)});`, {
    compilerOptions: { module: ts.ModuleKind.CommonJS },
  }).outputText;
  for (const stage of [11, 12, 13, 14, 15, 16] as const) {
    let cleanup = () => {};
    const module = { exports: {} as AudioPort };
    runInNewContext(code, { module, stage, isRevealStage, isVideoPackage, revealPlayback,
      useState: (initialize: () => unknown) => [initialize()], randomUUID: () => 'video-owner',
      useEffect: (effect: () => () => void) => { cleanup = effect(); },
      disposeVideo() { assert.fail('Silent route touched the native video player on teardown'); },
      nativeVideo() { assert.fail('Silent stage opened native video'); },
      initial: createSession({ runId: 'silent-route', stage, phraseCount: 1, mode: 'manual', rate: 1 }),
      runUnits: [{ text: 'We go.', translation: '가요.' }], engine: { current: null }, pack: { manifest: { kind: 'video' } },
      nativeAudio() { assert.fail('Silent stage opened native audio'); },
    });
    await module.exports.prepare(0, 0, 1);
    assert.ok(module.exports.duration!() > 0);
    module.exports.dispose();
    cleanup();
  }
});

test('video routes pass the saved unit mapping without opening independent native audio', () => {
  let declaration: ts.VariableDeclaration | undefined;
  function find(node: ts.Node) {
    if (ts.isVariableDeclaration(node) && node.name.getText(source) === 'audio') declaration = node;
    ts.forEachChild(node, find);
  }
  find(screen);
  const code = ts.transpileModule(`module.exports = (${declaration!.initializer!.getText(source)});`, {
    compilerOptions: { module: ts.ModuleKind.CommonJS },
  }).outputText;
  for (const stage of [2, 3, 4, 5, 6, 7, 8, 9, 10]) {
    const runUnits = stage < 7 ? [{ sourceIndices: [0] }, { sourceIndices: [1] }]
      : [{ sourceIndices: [0, 1, 2] }, { sourceIndices: [3] }];
    let args: unknown[] = [];
    runInNewContext(code, { module: { exports: {} }, stage, isRevealStage, videoOwner: 'video', monitorKey: 'monitor',
      runUnits, engine: { current: null }, pack: { manifest: { phrases: [{ start: 1, end: 2 }, { start: 3, end: 5 }] } },
      isVideoPackage: () => true, nativeVideo: (...values: unknown[]) => { args = values; },
      nativeAudio() { assert.fail('Video route opened native audio'); },
    });
    assert.equal(JSON.stringify(args[6]), JSON.stringify(runUnits.map(unit => unit.sourceIndices)));
    assert.equal(JSON.stringify(args[5]), '[1,2]');
  }
});

test('reauthorization restores paused player content without clearing unrelated unavailability', async () => {
  let construction: ts.NewExpression | undefined;
  function find(node: ts.Node) {
    if (ts.isNewExpression(node) && node.expression.getText(source) === 'PaidLearningAccess') construction = node;
    ts.forEachChild(node, find);
  }
  find(screen);
  const code = ts.transpileModule(`module.exports = (${construction!.getText(source)});`, {
    compilerOptions: { module: ts.ModuleKind.CommonJS },
  }).outputText;
  let allowed = false, accessReady = false, unavailable = false, accessDenied = false, pauses = 0;
  const module = {exports: undefined as unknown as PaidLearningAccess};
  runInNewContext(code, {module, PaidLearningAccess, active:true,
    paidAccessSource: {refresh:async()=>({revision:1,allowed}),subscribe:()=>()=>{}},
    sentenceEntry:{cancel(){}},engine:{current:{pause(){pauses++;}}},
    dictionary:{cancel(){}},
    setUnavailable(value:boolean){unavailable=value;},setAccessReady(value:boolean){accessReady=value;},
    setAccessDenied(value:boolean){accessDenied=value;},setCelebrating(){},setXpGain(){},
  });
  await module.exports.enter();
  assert.ok(pauses > 0);
  allowed=true; await module.exports.enter();
  assert.ok(descendants(layout(accessReady,unavailable,accessDenied).root).some(node=>node.type==='SpeechContent'));
  unavailable=true; await module.exports.enter();
  assert.equal(descendants(layout(accessReady,unavailable,accessDenied).root).some(node=>node.type==='SpeechContent'),false);
  module.exports.dispose();
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
