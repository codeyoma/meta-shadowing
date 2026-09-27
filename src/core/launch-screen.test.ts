import test, { type TestContext } from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import { nativeHooks } from '../test-support/native-hooks';
import { nativeModules } from '../test-support/native-render';

function fixture(t: TestContext, reducedMotion = false, options: {
  haptics?: boolean; launchHaptics?: boolean; hapticError?: 'sync' | 'async';
  start?: Promise<void>; initialState?: string;
} = {}) {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const runtime = nativeHooks();
  let fontsLoaded = false, fontError: Error | null = null;
  let starts = 0, stops = 0, hides = 0;
  const events: string[] = [];
  const player = { async startAnimating() { starts++; await options.start; }, async stopAnimating() { stops++; } };
  const listeners = new Set<(state: string) => void>();
  const appState = { currentState: options.initialState ?? 'active', addEventListener(_: string, fn: (state: string) => void) {
    listeners.add(fn); return { remove() { listeners.delete(fn); } };
  } };
  const haptic = (name: string) => {
    events.push(name);
    if (options.hapticError === 'sync') throw Error('Haptics unavailable');
    return options.hapticError === 'async' ? Promise.reject(Error('Haptics unavailable')) : Promise.resolve();
  };
  const children = ({ children }: React.PropsWithChildren) => children;
  const Stack = Object.assign(({ children }: React.PropsWithChildren) => React.createElement('Stack', null, children), { Screen: () => null });
  const load = nativeModules({ react: runtime.hooks,
    'react-native': { View: 'View', AppState: appState },
    'react-native-reanimated': { useReducedMotion: () => reducedMotion },
    'expo-image': { Image: (props: any) => { if (props.ref) props.ref.current = player; return React.createElement('Image', props); } },
    'expo-splash-screen': { async preventAutoHideAsync() {}, hide() { hides++; } },
    'expo-status-bar': { StatusBar: 'StatusBar' },
    'expo-font': { useFonts: () => [fontsLoaded, fontError] },
    '@expo-google-fonts/nunito/800ExtraBold': { Nunito_800ExtraBold: 1 },
    'expo-router': { Stack },
    '@/components/ui': { usePalette: () => ({}) },
    '@/components/library-context': { LibraryProvider: children },
    '@/components/progress-profile': { ProgressProfile: children },
    '@/components/study-header': { StudyHeader: () => null },
    '@/native/purchases': { startPurchases() {} },
    '@/native/package-availability': { startPackageAvailability() {} },
    '@/../modules/learning-haptics/src/LearningHapticsModule': { __esModule: true, default: {
      isEnabled: () => options.haptics ?? true,
      isLaunchEnabled: () => options.launchHaptics ?? true,
      prepareLaunch: () => haptic('prepare'), playLaunch: () => haptic('play'), stopLaunch: () => haptic('stop'),
    } },
    '../../assets/brand/talking-pup-512.webp': 101,
    '../../assets/brand/launch-wordmark.png': 102,
  });
  const Layout = load('app/_layout.tsx').default;
  runtime.render(React.createElement(Layout));
  t.after(() => runtime.dispose());
  const image = () => runtime.flush().find(n => n.type === 'Image' && n.props.source === 101);
  const wordmark = () => runtime.flush().find(n => n.type === 'Image' && n.props.source === 102);
  const displayed = () => {
    assert.ok(image(), 'Show the supplied launch artwork before opening the app');
    image()!.props.onDisplay();
    wordmark()?.props.onDisplay();
  };
  const settle = async () => { for (let i = 0; i < 5; i++) { await Promise.resolve(); runtime.flush(); } };
  return { runtime, image, wordmark, displayed, settle, events, get starts() { return starts; }, get stops() { return stops; }, get hides() { return hides; },
    state(state: string) { appState.currentState = state; listeners.forEach(fn => fn(state)); runtime.flush(); },
    get subscriptions() { return listeners.size; },
    fonts(error: Error | null = null) { fontsLoaded = !error; fontError = error; runtime.flush(); },
    async tick(ms: number) { t.mock.timers.tick(ms); await settle(); } };
}

test('launch shows a two-thirds-size centered puppy and preserves the uncropped footer', t => {
  const f = fixture(t);
  assert.ok(f.wordmark(), 'Show the supplied wordmark below the puppy');
  assert.deepEqual({ ...f.image()!.props.style }, { width: 160, height: 160 });
  assert.deepEqual({ ...f.wordmark()!.props.style }, {
    position: 'absolute', bottom: 58, alignSelf: 'center', width: 220, height: 220 * 2 / 3,
  });
  assert.equal(f.wordmark()!.props.contentFit, 'contain');
  assert.equal(f.wordmark()!.props.transition, 0);
});

test('native handoff waits for both artworks before playing one full cycle', async t => {
  const f = fixture(t); f.fonts();
  f.image()!.props.onDisplay(); await f.settle();
  assert.equal(f.hides, 0, 'Keep the native wordmark visible until its animated-screen copy is ready');
  assert.equal(f.starts, 0);
  await f.tick(1000);
  assert.ok(f.wordmark()); f.wordmark()!.props.onDisplay(); await f.settle();
  assert.equal(f.hides, 1); assert.equal(f.starts, 1);
  await f.tick(2399); assert.ok(f.wordmark());
  await f.tick(1); assert.equal(f.wordmark(), undefined);
});

test('wordmark load failure does not block the puppy animation or the ready app', async t => {
  const f = fixture(t); f.fonts();
  f.image()!.props.onDisplay();
  assert.ok(f.wordmark()); f.wordmark()!.props.onError({ error: 'wordmark unavailable' });
  await f.settle(); assert.equal(f.starts, 1);
  await f.tick(2400); assert.equal(f.wordmark(), undefined);
  assert.ok(f.runtime.flush().some(n => n.type === 'Stack'));
});

test('a missing wordmark display callback cannot trap the ready app behind the native splash', async t => {
  const f = fixture(t); f.fonts();
  f.image()!.props.onDisplay(); await f.settle();
  await f.tick(5000);
  assert.equal(f.wordmark(), undefined);
  assert.equal(f.hides, 1);
  assert.ok(f.runtime.flush().some(n => n.type === 'Stack'));
});

test('launch plays one full cycle only after the image displays, then opens the ready app', async t => {
  const f = fixture(t);
  f.fonts();
  assert.equal(f.hides, 0, 'Do not expose an empty frame between the native and animated splash');
  f.displayed(); await f.settle();
  assert.equal(f.hides, 1);
  assert.equal(f.image()!.props.source, 101);
  assert.equal(f.image()!.props.autoplay, false, 'Playback starts explicitly after the native splash is hidden');
  assert.equal(f.image()!.props.useAppleWebpCodec, false, 'Use the codec that preserves WebP frame timing and blending');
  assert.equal(f.starts, 1);
  await f.tick(2399); assert.ok(f.image(), 'Do not cut off the final frame');
  await f.tick(1); assert.equal(f.image(), undefined);
  assert.ok(f.stops >= 1);
  assert.ok(f.runtime.flush().some(n => n.type === 'Stack'));
  await f.tick(10000); f.fonts();
  assert.equal(f.starts, 1, 'Later renders must not replay the launch animation');
});

test('a finished launch animation waits for fonts without looping', async t => {
  const f = fixture(t);
  f.displayed(); await f.settle(); await f.tick(2400);
  assert.ok(f.image(), 'Keep the still artwork while fonts are pending');
  assert.ok(f.stops >= 1);
  await f.tick(10000); assert.equal(f.starts, 1);
  assert.equal(f.runtime.flush().some(n => n.type === 'Stack'), false);
  f.fonts(); assert.equal(f.image(), undefined);
  assert.ok(f.runtime.flush().some(n => n.type === 'Stack'));
});

test('a slow image load still gets a complete animation cycle', async t => {
  const f = fixture(t); f.fonts();
  await f.tick(4000);
  f.displayed(); await f.settle();
  await f.tick(2399); assert.ok(f.image());
  await f.tick(1); assert.equal(f.image(), undefined);
});

test('font failure still opens the app after the launch animation', async t => {
  const f = fixture(t);
  f.fonts(Error('font unavailable'));
  f.displayed(); await f.settle(); await f.tick(2400);
  assert.equal(f.image(), undefined);
  assert.ok(f.runtime.flush().some(n => n.type === 'Stack'));
});

test('Reduce Motion keeps the artwork still and adds no launch delay', async t => {
  const f = fixture(t, true);
  f.displayed(); await f.settle();
  assert.equal(f.starts, 0);
  f.fonts(); await f.settle();
  assert.equal(f.image(), undefined);
  assert.ok(f.runtime.flush().some(n => n.type === 'Stack'));
  assert.ok(f.hides >= 1);
});

test('a failed launch image cannot block the ready app', async t => {
  const f = fixture(t); f.fonts();
  assert.ok(f.image()); f.image()!.props.onError({ error: 'image unavailable' }); await f.settle();
  assert.equal(f.image(), undefined);
  assert.ok(f.runtime.flush().some(n => n.type === 'Stack'));
  assert.ok(f.hides >= 1);
});

test('a missing native image callback has a bounded fallback', async t => {
  const f = fixture(t); f.fonts();
  assert.ok(f.image());
  await f.tick(5000);
  assert.equal(f.image(), undefined);
  assert.ok(f.runtime.flush().some(n => n.type === 'Stack'));
  assert.ok(f.hides >= 1);
});

test('unmount stops playback and cancels the launch timer', async t => {
  const f = fixture(t);
  f.displayed(); await f.settle();
  f.runtime.render(null);
  const stops = f.stops;
  assert.ok(stops >= 1);
  await f.tick(10000);
  assert.equal(f.starts, 1); assert.equal(f.stops, stops);
});

test('launch prepares early and schedules one native haptic pattern after animation starts', async t => {
  let started!: () => void;
  const f = fixture(t, false, { start: new Promise<void>(resolve => { started = resolve; }) });
  assert.deepEqual(f.events, ['prepare']);
  f.displayed(); await f.settle();
  assert.equal(f.events.includes('play'), false, 'Do not vibrate before the native animation starts');
  started(); await f.settle();
  assert.equal(f.events.filter(e => e === 'play').length, 1);
  await f.tick(2400);
  assert.equal(f.events.at(-1), 'stop');
  await f.tick(10000); f.fonts();
  assert.equal(f.events.filter(e => e === 'play').length, 1, 'Slow loading and renders never repeat the pattern');
});

test('Reduce Motion suppresses launch haptics as well as animation', async t => {
  const f = fixture(t, true); f.displayed(); await f.settle(); f.fonts();
  assert.equal(f.events.includes('prepare'), false);
  assert.equal(f.events.includes('play'), false);
});

for (const options of [{ haptics: false }, { launchHaptics: false }]) {
  test(`launch always plays despite obsolete app preferences ${JSON.stringify(options)}`, async t => {
    const f = fixture(t, false, options); f.fonts(); f.displayed(); await f.settle();
    assert.equal(f.events.includes('prepare'), true); assert.equal(f.events.includes('play'), true);
    assert.equal(f.starts, 1);
    await f.tick(2400); assert.equal(f.image(), undefined);
  });
}

for (const hapticError of ['sync', 'async'] as const) {
  test(`${hapticError} haptic failures never block app launch`, async t => {
    const f = fixture(t, false, { hapticError }); f.fonts(); f.displayed(); await f.settle();
    assert.ok(f.events.includes('play'), 'Exercise the failing native haptic boundary');
    await f.tick(2400); assert.equal(f.image(), undefined);
    assert.ok(f.runtime.flush().some(n => n.type === 'Stack'));
  });
}

test('leaving active state stops launch feedback and never replays it on return', async t => {
  const f = fixture(t); f.fonts(); f.displayed(); await f.settle();
  await f.tick(500); f.state('inactive'); await f.settle();
  assert.equal(f.events.at(-1), 'stop'); assert.ok(f.stops > 0);
  assert.equal(f.image(), undefined);
  f.state('background'); f.state('active'); await f.tick(10000);
  assert.equal(f.starts, 1); assert.equal(f.events.filter(e => e === 'play').length, 1);
});

test('an initially inactive launch waits for the first active state before animating or vibrating', async t => {
  const f = fixture(t, false, { initialState: 'inactive' }); f.fonts(); f.displayed(); await f.settle();
  assert.equal(f.starts, 0); assert.equal(f.events.includes('play'), false);
  f.state('active'); await f.settle();
  assert.equal(f.starts, 1); assert.equal(f.events.filter(e => e === 'play').length, 1);
});

for (const interrupt of ['inactive', 'unmount', 'image error'] as const) {
  test(`a late animation-start completion cannot vibrate after ${interrupt}`, async t => {
    let started!: () => void;
    const f = fixture(t, false, { start: new Promise<void>(resolve => { started = resolve; }) });
    f.fonts(); f.displayed(); await f.settle();
    if (interrupt === 'inactive') f.state('inactive');
    else if (interrupt === 'unmount') f.runtime.render(null);
    else f.image()!.props.onError({ error: 'decode failed' });
    await f.settle(); started(); await f.settle();
    assert.equal(f.events.includes('play'), false); assert.ok(f.stops > 0);
    assert.equal(f.events.at(-1), 'stop');
    if (interrupt === 'unmount') assert.equal(f.subscriptions, 0);
  });
}

test('image load timeout never triggers launch haptics', async t => {
  const f = fixture(t); f.fonts(); await f.tick(5000);
  assert.equal(f.events.includes('play'), false); assert.equal(f.events.at(-1), 'stop');
});
