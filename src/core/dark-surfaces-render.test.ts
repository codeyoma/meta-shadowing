import { test } from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import { nativeHooks } from '../test-support/native-hooks';
import { nativeModules, nativeMotion } from '../test-support/native-render';

function setup(scheme: 'light' | 'dark', adapters: Record<string, unknown> = {}) {
  const runtime = nativeHooks();
  const pressable = ({ children, style, ...props }: any) => React.createElement('Pressable', {
    ...props, style: typeof style === 'function' ? style({ pressed: false }) : style,
  }, typeof children === 'function' ? children({ pressed: false }) : children);
  const load = nativeModules({ react: runtime.hooks,
    'react-native': { Text: 'Text', View: 'View', ScrollView: 'ScrollView', Pressable: pressable, useColorScheme: () => scheme,
      useWindowDimensions: () => ({ fontScale: 1 }), StyleSheet: { hairlineWidth: 1 }, PlatformColor: (name: string) => name },
    'react-native-reanimated': nativeMotion, 'expo-font': { isLoaded: () => true }, 'expo-image': { Image: 'Image' },
    'expo-router': { usePathname: () => '/lesson', useFocusEffect() {} }, '@/native/tap-feedback': { tapFeedback() {} },
    ...adapters,
  });
  return { runtime, load };
}
const style = (node: React.ReactElement<any>) => Object.assign({}, ...[node.props.style].flat().filter(Boolean));

test('the book list keeps its theme and equal outer and inter-card spacing', () => {
  for (const scheme of ['light', 'dark'] as const) {
    const { runtime, load } = setup(scheme, {
      '@/components/library-context': { useLibrary: () => ({ selection: { language: 'english' } }) },
      '@/native/catalog': { books: ['first', 'second'].map(id => ({ id, packageKey: id, language: 'english' })) },
      '@/native/paid-package': { isPaidDuo: () => false },
      '@/native/video-package': { localVideoPackageInvalid: false },
      '@/components/library-book': { LibraryBook: () => null },
      '@/components/package-purchase-card': { PackagePurchaseCard: () => null },
      '@/components/delivery-diagnostics': { DeliveryDiagnostics: () => null },
      '../../../modules/package-delivery': { animationPreviewEnabled: false },
      '../../../assets/brand/banner-dark.png': {}, '../../../assets/brand/banner-light.png': {},
    });
    const Library = load('app/(tabs)/index.tsx').default;
    const nodes = runtime.render(React.createElement(Library));
    assert.equal(style(nodes[0]!).backgroundColor, scheme === 'light' ? '#f2f3f5' : '#000000');
    assert.ok(nodes.some(n => n.type === 'Text' && n.props.children === '도서 목록'));
    assert.ok(!nodes.some(n => n.type === 'Image' && n.props.accessibilityLabel === '쇄도잉'),
      'The book list does not repeat the brand banner above its heading');
    const pageInset = nodes[0]!.props.contentContainerStyle.padding;
    const grid = nodes.find(n => style(n).flexWrap === 'wrap' && style(n).rowGap)!;
    const cells = nodes.filter(n => style(n).width === '50%');
    assert.equal(cells.length, 2);
    const leftInset = pageInset + style(grid).marginHorizontal + style(cells[0]!).paddingHorizontal;
    const rightInset = pageInset + style(grid).marginHorizontal + style(cells[1]!).paddingHorizontal;
    const columnGap = style(cells[0]!).paddingHorizontal + style(cells[1]!).paddingHorizontal;
    assert.equal(leftInset, pageInset, 'The grid stays aligned with the section heading');
    assert.equal(columnGap, leftInset, 'The middle gap matches the left page margin');
    assert.equal(columnGap, rightInset, 'The middle gap matches the right page margin');
    assert.equal(style(grid).rowGap, columnGap, 'Horizontal and vertical card gaps match');
    runtime.dispose();
  }
});
function neutral(color: string) {
  assert.match(color, /^#[\da-f]{6}$/i);
  const rgb = [1, 3, 5].map(i => parseInt(color.slice(i, i + 2), 16));
  assert(Math.max(...rgb) - Math.min(...rgb) <= 4, `Expected neutral surface, got ${color}`);
}

test('dark cards and secondary actions use gray surfaces while primary action colors stay unchanged', () => {
  const { runtime, load } = setup('dark');
  const { Card, Label, ActionButton } = load('components/ui.tsx');
  const nodes = runtime.render(React.createElement(Card, null,
    React.createElement(Label, null, 'Readable text'),
    ...[{ title: 'Continue' }, { title: 'Back', tone: 'cardinal' }, { title: 'Secondary', secondary: true }]
      .map(props => React.createElement(ActionButton, { ...props, key: props.title, onPress() {} }))));
  neutral(style(nodes[0]!).backgroundColor);
  neutral(style(nodes[0]!).borderColor);
  assert.equal(style(nodes.find(n => n.props.children === 'Readable text')!).color, '#ffffff');
  for (const label of ['Back', 'Secondary']) {
    const color = style(nodes.find(n => n.props.accessibilityLabel === label)!).backgroundColor;
    neutral(color); assert.notEqual(color, '#ffffff', 'Secondary actions must not flash white in dark mode');
  }
  assert.equal(style(nodes.find(n => n.props.accessibilityLabel === 'Continue')!).backgroundColor, '#ffc800');
  assert.match(style(nodes.find(n => n.props.accessibilityLabel === 'Continue')!).boxShadow, /#ff9600$/);
  runtime.dispose();
});

test('stage popup action follows the surface theme and preserves its light appearance', () => {
  for (const scheme of ['light', 'dark'] as const) {
    const { runtime, load } = setup(scheme);
    const { StageStartPopover } = load('components/stage-start-popover.tsx');
    const nodes = runtime.render(React.createElement(StageStartPopover, { anchor: { stage: 1, x: 150, top: 30, bottom: 90, label: '이어하기', above: false },
      width: 350, onClose() {}, onStart() {} }));
    const button = nodes.find(n => n.props.accessibilityLabel === 'Stage 1 이어하기')!;
    const caption = nodes.find(n => n.props.children === '이어하기')!;
    if (scheme === 'dark') {
      neutral(style(button).backgroundColor); assert.notEqual(style(button).backgroundColor, '#ffffff');
      assert.equal(style(caption).color, '#ffffff');
    } else {
      assert.equal(style(button).backgroundColor, '#ffffff'); assert.equal(style(caption).color, '#c75a00');
    }
    runtime.dispose();
  }
});

test('the selected book summary uses gray surfaces in dark mode and retains its light colors', () => {
  for (const scheme of ['light', 'dark'] as const) {
    const { runtime, load } = setup(scheme, {
      '@/components/library-context': { useLibrary: () => ({ selection: { packageKey: 'fixture', language: 'english' } }) },
      '@/components/use-book-records': { useBookRecords: () => ({ records: [], overview: { current: 1, percent: 0, completed: 0 }, bypass: false }) },
      '@/components/use-package-learning-access': { usePackageLearningStatus: () => ({ ready: true, accessBlocked: false, allowed: true }) },
      '@/native/catalog': { selectedPackage: () => ({ packageKey: 'fixture', title: 'Fixture', sentences: 12, chapters: 3 }), languages: [] },
      '@/native/paid-package': { mayUsePackage: () => true }, '../../../assets/illustrations/morning-notes.png': {},
    });
    const Lesson = load('app/(tabs)/lesson.tsx').default;
    const nodes = runtime.render(React.createElement(Lesson));
    const captions = nodes.filter(n => n.type === 'Text').map(n => [n.props.children].flat().join(''));
    const cover = nodes.find(n => n.type === 'Image' && n.props.contentFit === 'cover')!;
    const details = nodes.find(n => n.type === 'View' && style(n).flex === 1 && style(n).gap === 3)!;
    assert.equal(style(cover).alignSelf, 'flex-start', 'The cover begins at the summary row top');
    assert.equal(style(details).alignSelf, 'flex-start', 'The tag stack begins at the same top edge as the cover');
    assert.ok(captions.includes('12문장'), 'The selected book summary displays its sentence count alone');
    assert.ok(!captions.some(caption => caption.includes('챕터')), 'Chapter metadata is not displayed on the learning map');
    const sentenceCount = nodes.find(n => n.type === 'Text' && [n.props.children].flat().join('') === '12문장')!;
    for (const caption of ['샘플', '1,728 XP +']) {
      const tag = nodes.find(n => n.type === 'Text' && [n.props.children].flat().join('') === caption)!;
      assert.equal(style(tag).fontSize, style(sentenceCount).fontSize, 'Summary tags match the sentence-count text size');
    }
    const tags = nodes.filter(n => n.type === 'View' && style(n).paddingHorizontal === 10 && style(n).borderRadius === 10);
    assert.equal(tags.length, 2);
    for (const tag of tags) assert.equal(style(tag).paddingVertical, 2.5, 'Both summary tags use half the original vertical inset');
    const featured = style(nodes[1]!);
    const track = style(nodes.find(n => n.props.accessibilityLabel === '필수 반복을 완료한 스테이지')!);
    if (scheme === 'dark') { neutral(featured.backgroundColor); neutral(track.backgroundColor); }
    else { assert.equal(featured.backgroundColor, '#243541'); assert.equal(track.backgroundColor, '#465661'); }
    runtime.dispose();
  }
});

test('dark stage map removes tinted surfaces but retains the current stage orange edge', () => {
  const { runtime, load } = setup('dark');
  const { StagePath } = load('components/stage-path.tsx');
  const nodes = runtime.render(React.createElement(StagePath, { records: [1, 2].map(stage => ({ stage, count: 0, session: null })),
    current: 1, ready: true, onSelect() {} }));
  neutral(style(nodes[0]!).backgroundColor);
  assert(!nodes.some(n => style(n).experimental_backgroundImage), 'No teal or purple background wash in dark mode');
  assert(nodes.some(n => style(n).borderColor === '#ff9600' && style(n).backgroundColor === '#ffc800'));
  assert(!nodes.some(n => style(n).backgroundColor === '#042c60'), 'Stage numbers use gray, not navy, surfaces');
  runtime.dispose();
});

test('dark settings use black pages and gray groups; light surfaces and stage gradient remain unchanged', () => {
  for (const scheme of ['light', 'dark'] as const) {
    const { runtime, load } = setup(scheme);
    const { SettingsRow, useSettingsColors } = load('components/settings-row.tsx');
    const colors = useSettingsColors();
    const nodes = runtime.render(React.createElement(SettingsRow, { title: 'Fonts', icon: 'textformat', iconColor: '#007aff', onPress() {} }));
    const row = style(nodes.find(n => n.props.accessibilityLabel === 'Fonts')!);
    if (scheme === 'dark') {
      assert.equal(colors.background, '#000000'); assert.equal(colors.sheet, '#000000'); neutral(row.backgroundColor);
    } else {
      assert.equal(colors.background, '#f2f3f5'); assert.equal(row.backgroundColor, '#ffffff');
      const { StagePath } = load('components/stage-path.tsx');
      const map = runtime.render(React.createElement(StagePath, { records: [], current: 1, ready: true, onSelect() {} }));
      assert.equal(style(map[0]!).backgroundColor, '#ffffff');
      assert(map.some(n => style(n).experimental_backgroundImage && style(n).opacity === 0.22));
    }
    runtime.dispose();
  }
});
