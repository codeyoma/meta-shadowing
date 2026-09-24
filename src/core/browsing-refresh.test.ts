import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { resolve, dirname } from 'node:path';
import { runInNewContext } from 'node:vm';
import test from 'node:test';
import React from 'react';
import ts from 'typescript';
import { DatabaseSync } from 'node:sqlite';
import { Journal } from './journal';
import { palettes } from '../components/theme';

const require = createRequire(import.meta.url);
const root = resolve(import.meta.dirname, '..');
const pack = { language: 'english', id: 'fixture', title: 'Fixture', packageKey: 'fixture-v1',
  delivery: 'bundled', sentences: 1, chapters: null,
  manifest: { id: 'fixture', title: 'Fixture', version: 1, phrases: [{ text: 'Hello.', translation: '안녕.', file: 'a.m4a', sha256: '0'.repeat(64) }] } };
const installed = { bytes: 100, installed: true, busy: false };
function deferred<T>() {
  let resolve!: (value: T) => void, reject!: (error: Error) => void;
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}
function nodes(value: unknown): React.ReactElement<Record<string, any>>[] {
  if (Array.isArray(value)) return value.flatMap(nodes);
  if (!React.isValidElement<Record<string, any>>(value)) return [];
  return [value, ...nodes(value.props.children)];
}

// Run the actual screens/hooks, replacing only the React/navigation runtime,
// native I/O, and leaf drawing components. SQLite and domain logic remain real.
function fixture() {
  const db = new DatabaseSync(':memory:');
  const journal = new Journal({ exec: sql => db.exec(sql), run: (sql, ...args) => { db.prepare(sql).run(...args); },
    first: <T>(sql: string, ...args: (string | number)[]) => db.prepare(sql).get(...args) as T | null });
  let readStorage = async () => installed;
  let install = async () => {};
  let remove = async () => ({ cacheCleared: true });
  let readDelivery = async () => ({ phase: 'idle', progress: 0 });
  let verify = async () => true;
  let permitted = true;
  let selected = pack;
  let revision = 0;
  let monitorState = 'off';
  const monitorStatus = () => ({ state: monitorState, output: 'headphones', gain: 0.25 });
  const monitorListeners = new Set<(status: ReturnType<typeof monitorStatus>) => void>();
  const accessListeners = new Set<(value: { allowed: boolean; revision: number }) => void>();
  const appListeners = new Set<(state: string) => void>();
  const timers = new Set<() => void>();
  let render: () => unknown = () => null, output: unknown;
  let cursor = 0, dirty = true, focused = true;
  const slots: any[] = [];
  const effects = new Map<number, { deps: unknown[]; fn: () => any; cleanup?: () => void; focus: boolean; pending: boolean }>();
  const same = (a: unknown[], b: unknown[]) => a.length === b.length && a.every((v, i) => Object.is(v, b[i]));
  const effect = (fn: () => any, deps: unknown[], focus: boolean) => {
    const index = cursor++, previous = effects.get(index);
    if (!previous || !same(previous.deps, deps)) {
      previous?.cleanup?.();
      effects.set(index, { fn, deps, focus, pending: true });
    }
  };
  const hooks = {
    useState(initial: any) {
      const index = cursor++;
      if (!(index in slots)) slots[index] = typeof initial === 'function' ? initial() : initial;
      return [slots[index], (value: any) => {
        const next = typeof value === 'function' ? value(slots[index]) : value;
        if (!Object.is(next, slots[index])) { slots[index] = next; dirty = true; }
      }];
    },
    useRef(value: any) { const index = cursor++; return slots[index] ??= { current: value }; },
    useCallback(fn: any, deps: unknown[]) {
      const index = cursor++;
      if (!slots[index] || !same(slots[index].deps, deps)) slots[index] = { fn, deps };
      return slots[index].fn;
    },
    useEffect: (fn: () => any, deps: unknown[]) => effect(fn, deps, false),
    useSyncExternalStore(subscribe: (fn: () => void) => () => void, getSnapshot: () => unknown) {
      effect(() => subscribe(() => { dirty = true; }), [subscribe], false);
      return getSnapshot();
    },
  };
  const imports: Record<string, unknown> = {
    react: { ...React, ...hooks },
    'react-native': { View: 'View', ScrollView: 'ScrollView', Switch: 'Switch', Alert: { alert() {} },
      useColorScheme: () => 'light', AppState: { currentState: 'active', addEventListener: (_: string, fn: (state: string) => void) => {
        appListeners.add(fn); return { remove: () => appListeners.delete(fn) };
      } } },
    'expo-router': { router: { navigate() {}, push() {} }, useFocusEffect: (fn: () => any) => effect(fn, [fn], true) },
    'expo-image': { Image: 'Image' },
    'react-native-reanimated': { __esModule: true, default: { View: 'AnimatedView' },
      useReducedMotion: () => true, LayoutAnimationConfig: 'LayoutAnimationConfig', ReduceMotion: { System: 'system' },
      FadeIn: { duration: () => ({ reduceMotion: () => undefined }) },
      FadeOut: { duration: () => ({ reduceMotion: () => undefined }) } },
    '@/native/package': { isInstalled: () => verify(), installBundledPackage: () => install() },
    '@/native/package-storage': { readPackageStorage: () => readStorage(), removePackageMaterials: () => remove() },
    '@/native/catalog': { selectedPackage: () => selected, languages: [{ id: 'english', name: 'English' }] },
    '@/native/paid-package': { isPaidDuo: (p: typeof pack) => p.manifest.id === 'duo-33', mayUsePackage: () => permitted,
      paidDuoActions: { status: () => readDelivery(), start: () => install() },
      paidAccess: { getSnapshot: () => ({ allowed: permitted, revision }), refresh: async () => {},
        subscribe: (fn: any) => { accessListeners.add(fn); return () => accessListeners.delete(fn); } },
      paidAccessSource: { refresh: async () => ({ allowed: permitted, revision }), subscribe: (fn: any) => {
        accessListeners.add(fn); return () => accessListeners.delete(fn);
      } } },
    '@/native/video-package': { videoPackageActions: { install: async () => {} } },
    '@/native/hosted-package': { hostedStatus: () => readDelivery(), downloadHostedSample: () => install() },
    '@/native/free-duo': { isFreeDuo: () => false },
    '@react-native-community/slider': { __esModule: true, default: 'Slider' },
    '@/native/voice-monitor': { learningMonitorSupported: true, learningMonitor: () => ({
      enable: async () => { monitorState = 'monitoring'; }, disable: async () => { monitorState = 'off'; } }),
      monitorNative: { monitorStatus: async () => monitorStatus(),
        addListener: (_: string, fn: (status: ReturnType<typeof monitorStatus>) => void) => {
          monitorListeners.add(fn); return { remove: () => monitorListeners.delete(fn) };
        } } },
    '@/native/journal': { getJournal: () => journal },
    '@/native/progress-sync': { getProgressSync: () => ({ getSnapshot: () => ({ learningAvailable: true }), subscribe: () => () => {} }) },
    '@/native/stage-access': { testStageAccess: async () => true },
  };
  const leaves: Record<string, unknown> = {
    ui: { usePalette: () => palettes.light, Label: 'Label', Icon: 'Icon', Card: 'Card', ActionButton: 'ActionButton' },
    'feedback-pressable': { FeedbackPressable: 'Pressable' },
    'stage-path': { StagePath: 'StagePath' }, 'book-tags': { BookTags: 'BookTags' },
    'method-label': { MethodLabel: 'MethodLabel' },
    'owned-library-book-card': { OwnedLibraryBookCard: 'OwnedLibraryBookCard' },
    'hosted-library-book': { HostedLibraryBook: 'HostedLibraryBook' },
    'settings-section': { SettingsSection: 'SettingsSection' },
    'settings-row': { useSettingsColors: () => ({}) },
    'library-context': { useLibrary: () => ({ selection: { packageKey: selected.packageKey }, select: () => true }) },
  };
  const cache = new Map<string, any>();
  function load(file: string): any {
    if (cache.has(file)) return cache.get(file);
    const module = { exports: {} };
    cache.set(file, module.exports);
    const compiled = ts.transpileModule(readFileSync(file, 'utf8'), {
      compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX },
    }).outputText;
    runInNewContext(compiled, { module, exports: module.exports, console,
      setTimeout: (fn: () => void) => { timers.add(fn); return fn; }, clearTimeout: (fn: () => void) => { timers.delete(fn); },
      __DEV__: false, require: (name: string) => {
      if (name in imports) return imports[name];
      if (name.includes('assets/')) return 1;
      const path = name.startsWith('@/') ? resolve(root, name.slice(2)) : name.startsWith('.') ? resolve(dirname(file), name) : null;
      if (!path) return require(name);
      if (path.startsWith(resolve(root, 'components'))) {
        const leaf = leaves[path.split('/').at(-1)!];
        if (leaf) return leaf;
      }
      if (path.startsWith(resolve(root, 'core'))) return require(path + '.ts');
      return load(path + (existsSync(path + '.tsx') ? '.tsx' : '.ts'));
    } });
    return module.exports;
  }
  function flush() {
    let turns = 0;
    while (dirty) {
      assert.ok(++turns < 30, 'Render loop');
      dirty = false; cursor = 0; output = render();
      for (const e of effects.values()) if (e.pending && (!e.focus || focused)) {
        e.pending = false; e.cleanup = e.fn();
      }
    }
    return output;
  }
  return {
    load, flush, nodes: () => nodes(flush()),
    mount(fn: () => unknown) { render = fn; dirty = true; return flush(); },
    async settle() { for (let i = 0; i < 15; i++) { await Promise.resolve(); flush(); } },
    blur() { focused = false; for (const e of effects.values()) if (e.focus) { e.cleanup?.(); e.cleanup = undefined; e.pending = true; } },
    focus() { focused = true; dirty = true; return flush(); },
    storage(fn: typeof readStorage) { readStorage = fn; }, verify(fn: typeof verify) { verify = fn; },
    install(fn: typeof install) { install = fn; }, remove(fn: typeof remove) { remove = fn; },
    delivery(fn: typeof readDelivery) { readDelivery = fn; },
    interruptMonitor() { monitorState = 'off'; monitorListeners.forEach(fn => fn(monitorStatus())); },
    select(value: typeof pack) { selected = value; dirty = true; },
    revoke() { permitted = false; revision++; accessListeners.forEach(fn => fn({ allowed: false, revision })); dirty = true; },
    grant() { permitted = true; revision++; accessListeners.forEach(fn => fn({ allowed: true, revision })); dirty = true; },
    background() { appListeners.forEach(fn => fn('background')); dirty = true; },
    foreground() { appListeners.forEach(fn => fn('active')); dirty = true; },
    poll() { const pending = [...timers]; timers.clear(); for (const timer of pending) timer(); },
    polling: () => timers.size,
    unmount() { for (const e of effects.values()) e.cleanup?.(); effects.clear(); slots.length = 0; },
    close() { for (const e of effects.values()) e.cleanup?.(); db.close(); },
  };
}

test('stage tab never shows an installation CTA while checking an installed book', async () => {
  const f = fixture();
  try {
    const pending = deferred<typeof installed>(); f.storage(() => pending.promise);
    const Lesson = f.load(resolve(root, 'app/(tabs)/lesson.tsx')).default;
    f.mount(Lesson);
    assert.equal(f.nodes().some(n => n.props.title === '도서 선택으로'), false);
    pending.resolve(installed); await f.settle();
    let reads = 0;
    f.blur(); f.storage(async () => { reads++; return installed; }); f.focus();
    assert.equal(f.nodes().some(n => n.props.title === '도서 선택으로'), false);
    const button = f.nodes().find(n => n.props.accessibilityLabel?.startsWith('Stage '))!;
    assert.equal(button.props.style({ pressed: false }).opacity, 1, 'Revalidation must not dim the existing stage action');
    assert.equal(button.props.disabled, false);
    assert.equal(reads, 0);
  } finally { f.close(); }
});

for (const terminal of ['ready', 'cancelled', 'failed'] as const) {
  test(`hosted download reaches ${terminal} in shared state while its card is unmounted`, async () => {
    const f = fixture();
    try {
      let phase = 'downloading';
      f.delivery(async () => ({ phase, progress: phase === 'ready' ? 1 : 0.4 }));
      f.storage(async () => ({ ...installed, installed: phase === 'ready' }));
      const hosted = { ...pack, manifest: { ...pack.manifest, id: 'hosted-morning-notes' } };
      const useMaterials = f.load(resolve(root, 'components/use-package-materials.ts')).usePackageMaterials;
      let materials: any;
      f.mount(() => materials = useMaterials(hosted, false, () => {})); await f.settle();
      assert.equal(materials.delivery.phase, 'downloading');
      f.unmount(); phase = terminal; f.poll(); await f.settle();
      f.mount(() => materials = useMaterials(hosted, false, () => {}));
      assert.equal(materials.delivery.phase, terminal);
      assert.equal(materials.storage.installed, terminal === 'ready');
      assert.equal(materials.reading, false);
      assert.equal(f.polling(), 0, 'Terminal downloads must not keep polling');
    } finally { f.close(); }
  });
}

test('shared storage watches a native cache purge until it is safe to act', async () => {
  const f = fixture();
  try {
    let busy = true; f.storage(async () => ({ ...installed, busy }));
    const useMaterials = f.load(resolve(root, 'components/use-package-materials.ts')).usePackageMaterials;
    let materials: any;
    f.mount(() => materials = useMaterials(pack, false, () => {})); await f.settle();
    assert.equal(materials.storage.busy, true);
    busy = false; f.poll(); await f.settle();
    assert.equal(materials.storage.busy, false); assert.equal(f.polling(), 0);
  } finally { f.close(); }
});

test('library and stage reuse the same verified snapshot even after unmounting', async () => {
  const f = fixture();
  try {
    let reads = 0; f.storage(async () => { reads++; return installed; });
    const useMaterials = f.load(resolve(root, 'components/use-package-materials.ts')).usePackageMaterials;
    const useStatus = f.load(resolve(root, 'components/use-package-learning-access.ts')).usePackageLearningStatus;
    let materials: any, status: any;
    f.mount(() => materials = useMaterials(pack, false, () => {})); await f.settle();
    for (let i = 0; i < 3; i++) {
      f.unmount(); f.mount(() => status = useStatus(pack));
      assert.equal(status.ready, true); assert.equal(status.allowed, true);
      f.unmount(); f.mount(() => materials = useMaterials(pack, false, () => {}));
      assert.equal(materials.storage.installed, true); assert.equal(materials.reading, false);
    }
    assert.equal(reads, 1, 'One filesystem check per shared initial snapshot, not per screen');
  } finally { f.close(); }
});

test('download completion and deletion publish to both browsing hooks without navigation', async () => {
  const f = fixture();
  try {
    let present = false;
    f.storage(async () => ({ ...installed, installed: present }));
    f.install(async () => { present = true; });
    f.remove(async () => { present = false; return { cacheCleared: true }; });
    const useMaterials = f.load(resolve(root, 'components/use-package-materials.ts')).usePackageMaterials;
    const useStatus = f.load(resolve(root, 'components/use-package-learning-access.ts')).usePackageLearningStatus;
    const { installMaterials } = f.load(resolve(root, 'native/package-availability.ts'));
    let materials: any, status: any;
    f.mount(() => { materials = useMaterials(pack, true, () => {}); status = useStatus(pack); }); await f.settle();
    assert.equal(status.ready, false);
    await installMaterials(pack, () => {}); await f.settle();
    assert.equal(status.allowed, true); assert.equal(materials.storage.installed, true);
    await materials.remove(); await f.settle();
    assert.equal(status.allowed, false); assert.equal(status.ready, false);
    assert.equal(materials.storage.installed, false);
  } finally { f.close(); }
});

test('cached installation never grants revoked access and restored access updates without tab switching', async () => {
  const f = fixture();
  try {
    f.delivery(async () => ({ phase: 'ready', progress: 1 }));
    const paid = { ...pack, manifest: { ...pack.manifest, id: 'duo-33' } };
    const useStatus = f.load(resolve(root, 'components/use-package-learning-access.ts')).usePackageLearningStatus;
    let status: any;
    f.mount(() => status = useStatus(paid)); await f.settle();
    assert.equal(status.allowed, true);
    f.revoke(); f.flush();
    assert.equal(status.ready, true, 'Revocation does not delete downloaded files');
    assert.equal(status.allowed, false);
    f.grant(); f.flush(); assert.equal(status.allowed, true);
  } finally { f.close(); }
});

test('revoked paid materials stay measurable and removable when delivery authorization fails', async () => {
  const f = fixture();
  try {
    f.revoke(); f.delivery(async () => { throw Error('unauthorized'); });
    let present = true; f.storage(async () => ({ ...installed, installed: present }));
    f.remove(async () => { present = false; return { cacheCleared: true }; });
    const paid = { ...pack, manifest: { ...pack.manifest, id: 'duo-33' } };
    const useMaterials = f.load(resolve(root, 'components/use-package-materials.ts')).usePackageMaterials;
    let materials: any;
    f.mount(() => materials = useMaterials(paid, true, () => {})); await f.settle();
    assert.equal(materials.storage?.bytes, 100);
    await materials.remove(); await f.settle();
    assert.equal(materials.storage.installed, false);
  } finally { f.close(); }
});

test('production JavaScript can re-enable wired monitoring after manual OFF and interruption', async () => {
  const f = fixture();
  try {
    const Controls = f.load(resolve(root, 'components/learning-monitor-controls.tsx')).LearningMonitorControls;
    f.mount(() => Controls({ sessionKey: 'lesson', allowed: true })); await f.settle();
    const control = () => f.nodes().find(n => n.type === 'Switch')!.props;
    assert.equal(control().disabled, false);
    assert.equal(f.nodes().find(n => n.type === 'SettingsSection')!.props.note,
      '유선이어폰 사용시 실시간으로 내 목소리를 모니터링 할 수 있어요');
    control().onValueChange(true); await f.settle();
    assert.equal(control().value, true);
    control().onValueChange(false); await f.settle();
    assert.equal(control().value, false);
    assert.equal(control().disabled, false, 'Manual OFF must allow a new explicit start');
    control().onValueChange(true); await f.settle();
    assert.equal(control().value, true);
    f.interruptMonitor(); await f.settle();
    assert.equal(control().value, false, 'An interruption must not automatically resume capture');
    assert.equal(control().disabled, false, 'The switch must allow explicit recovery after interruption');
    control().onValueChange(true); await f.settle();
    assert.equal(control().value, true);
  } finally { f.close(); }
});

test('library refocus keeps its verified study action without rechecking', async () => {
  const f = fixture();
  try {
    const Library = f.load(resolve(root, 'components/library-book.tsx')).LibraryBook;
    const child = Library({ book: pack, editing: false });
    f.mount(() => child.type(child.props)); await f.settle();
    let reads = 0;
    f.blur(); const pending = deferred<typeof installed>(); f.storage(() => { reads++; return pending.promise; }); f.focus();
    const card = f.nodes().find(n => n.type === 'OwnedLibraryBookCard')!;
    assert.equal(card.props.installed, true);
    assert.equal(card.props.busy, false, 'A background verification is not an install/removal operation');
    assert.equal(reads, 0, 'Switching tabs must reuse shared installation state');
    pending.resolve(installed); await f.settle();
  } finally { f.close(); }
});

test('foreground reconciliation does not reuse an obsolete in-flight file result', async () => {
  const f = fixture();
  let stop: (() => void) | undefined;
  try {
    stop = f.load(resolve(root, 'native/package-availability.ts')).startPackageAvailability();
    const old = deferred<typeof installed>(); f.storage(() => old.promise);
    const useStatus = f.load(resolve(root, 'components/use-package-learning-access.ts')).usePackageLearningStatus;
    let status: any;
    f.mount(() => status = useStatus(pack));
    f.background(); f.storage(async () => ({ ...installed, installed: false })); f.foreground();
    old.resolve(installed); await f.settle();
    assert.equal(status.ready, false); assert.equal(status.allowed, false);
  } finally { stop?.(); f.close(); }
});

test('deletion waits for pending verification and cannot be undone by its stale success', async () => {
  const f = fixture();
  try {
    const old = deferred<typeof installed>(); f.storage(() => old.promise);
    const useStatus = f.load(resolve(root, 'components/use-package-learning-access.ts')).usePackageLearningStatus;
    const { deleteMaterials } = f.load(resolve(root, 'native/package-availability.ts'));
    let status: any, removed = false;
    f.remove(async () => { removed = true; f.storage(async () => ({ bytes: 0, installed: false, busy: false })); return { cacheCleared: true }; });
    f.mount(() => status = useStatus(pack));
    const deleting = deleteMaterials(pack); f.flush();
    assert.equal(removed, false); assert.equal(status.allowed, false);
    old.resolve(installed); await deleting; await f.settle();
    assert.equal(removed, true); assert.equal(status.ready, false); assert.equal(status.allowed, false);
  } finally { f.close(); }
});

test('stage icons keep the verified build-access state during refocus', async () => {
  const f = fixture();
  try {
    const Lesson = f.load(resolve(root, 'app/(tabs)/lesson.tsx')).default;
    f.mount(Lesson); await f.settle();
    assert.equal(f.nodes().find(n => n.type === 'StagePath')!.props.bypass, true);
    f.blur(); f.focus();
    assert.equal(f.nodes().find(n => n.type === 'StagePath')!.props.bypass, true);
  } finally { f.close(); }
});

test('overlapping material refreshes share one verification without publishing a busy intermediate result', async () => {
  const f = fixture();
  try {
    const useMaterials = f.load(resolve(root, 'components/use-package-materials.ts')).usePackageMaterials;
    let current: any;
    f.mount(() => current = useMaterials(pack, false, () => {})); await f.settle();
    const pending = deferred<typeof installed>(); let reads = 0;
    f.storage(() => { reads++; return pending.promise; });
    const first = current.refresh(), second = current.refresh();
    assert.equal(reads, 1, 'Concurrent checks must not compete for the package-operation lock');
    pending.resolve(installed); await Promise.all([first, second]); await f.settle();
    assert.equal(current.storage.installed, true);
    assert.equal(current.reading, false);
  } finally { f.close(); }
});

test('confirmed missing files change the stage action only after verification finishes', async () => {
  const f = fixture();
  let stop: (() => void) | undefined;
  try {
    stop = f.load(resolve(root, 'native/package-availability.ts')).startPackageAvailability();
    const Lesson = f.load(resolve(root, 'app/(tabs)/lesson.tsx')).default;
    f.mount(Lesson); await f.settle();
    f.background(); const pending = deferred<typeof installed>(); f.storage(() => pending.promise); f.foreground();
    assert.equal(f.nodes().some(n => n.props.title === '도서 선택으로'), false);
    assert.equal(f.nodes().find(n => n.props.accessibilityLabel?.startsWith('Stage '))!.props.disabled, true);
    pending.resolve({ bytes: 0, installed: false, busy: false }); await f.settle();
    assert.equal(f.nodes().some(n => n.props.title === '도서 선택으로'), true);
    assert.equal(f.nodes().find(n => n.type === 'StagePath')!.props.ready, false);
  } finally { stop?.(); f.close(); }
});

test('browsing snapshots never authorize sensitive routes while checking, backgrounded, or revoked', async () => {
  const f = fixture();
  try {
    const paid = { ...pack, manifest: { ...pack.manifest, id: 'duo-33' } };
    const useAccess = f.load(resolve(root, 'components/use-package-learning-access.ts')).usePackageLearningAccess;
    let allowed = false;
    f.mount(() => allowed = useAccess(paid)); await f.settle();
    assert.equal(allowed, true);
    f.blur(); const pending = deferred<boolean>(); f.verify(() => pending.promise); f.focus();
    assert.equal(allowed, false);
    await f.settle(); f.revoke(); f.flush(); pending.resolve(true); await f.settle();
    assert.equal(allowed, false, 'A stale successful file check cannot restore revoked access');
    f.background(); f.flush(); assert.equal(allowed, false);
  } finally { f.close(); }
});

test('an obsolete package check cannot overwrite the newly selected book', async () => {
  const f = fixture();
  try {
    const useStatus = f.load(resolve(root, 'components/use-package-learning-access.ts')).usePackageLearningStatus;
    const old = deferred<typeof installed>(); f.storage(() => old.promise);
    let selected = pack, status: any;
    f.mount(() => status = useStatus(selected));
    selected = { ...pack, packageKey: 'other-v1', manifest: { ...pack.manifest, id: 'other' } };
    f.select(selected); f.storage(async () => ({ ...installed, installed: false })); await f.settle();
    assert.equal(status.ready, false);
    old.resolve(installed); await f.settle();
    assert.equal(status.ready, false);
    assert.equal(status.allowed, false);
  } finally { f.close(); }
});

test('a study button keeps its color but cannot be pressed during quiet revalidation', () => {
  const f = fixture();
  try {
    const Card = f.load(resolve(root, 'components/owned-library-book-card.tsx')).OwnedLibraryBookCard;
    const props = { title: 'Fixture', sentences: 1, chapters: null, completed: 0, editing: false,
      installed: true, busy: false, storage: installed, storageFailed: false, refreshing: true,
      onStudy() {}, onDownload() {}, onRemove() {}, onRetryStorage() {} };
    f.mount(() => Card(props));
    const action = f.nodes().find(n => n.props.title === '학습하기')!;
    const drawn = (action.type as Function)(action.props);
    assert.equal(drawn.props.style.backgroundColor, palettes.light.accent);
    assert.equal(nodes(drawn).find(n => n.type === 'Pressable')!.props.disabled, true);
  } finally { f.close(); }
});

test('material responses from an old package never replace a new package snapshot', async () => {
  const f = fixture();
  try {
    const useMaterials = f.load(resolve(root, 'components/use-package-materials.ts')).usePackageMaterials;
    const old = deferred<typeof installed>(); f.storage(() => old.promise);
    let selected = pack, current: any;
    f.mount(() => current = useMaterials(selected, false, () => {}));
    selected = { ...pack, packageKey: 'other-v1', manifest: { ...pack.manifest, id: 'other' } };
    f.select(selected); f.storage(async () => ({ bytes: 0, installed: false, busy: false })); await f.settle();
    assert.equal(current.storage?.installed, false);
    old.resolve(installed); await f.settle();
    assert.equal(current.storage?.installed, false);
  } finally { f.close(); }
});
