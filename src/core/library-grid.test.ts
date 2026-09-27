import test from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import { nativeHooks } from '../test-support/native-hooks';
import { nativeModules, nativeMotion } from '../test-support/native-render';

function fixture(onAlert: (_title: string, _message: string, buttons: any[]) => void = () => {}) {
  const runtime = nativeHooks();
  const load = nativeModules({ react: runtime.hooks,
    'react-native': { View: 'View', Text: 'Text', Pressable: 'Pressable',
      Alert: { alert: onAlert },
      useColorScheme: () => 'dark', useWindowDimensions: () => ({ fontScale: 1 }) },
    'react-native-reanimated': { ...nativeMotion, LayoutAnimationConfig: ({ children }: any) => children },
    'expo-image': { Image: 'Image' }, 'expo-font': { isLoaded: () => false },
    'expo-router': { usePathname: () => '/' },
    '@/native/tap-feedback': { tapFeedback() {} },
    '../../assets/illustrations/morning-notes.png': {},
  });
  return { runtime, load };
}

test('portrait library cards preserve metadata and study, download, retry and confirmed removal actions', () => {
  let confirmation: any[], studies = 0, downloads = 0, removals = 0, retries = 0, cancellations = 0;
  const { runtime, load } = fixture((_title, _message, buttons) => { confirmation = buttons; });
  const { OwnedLibraryBookCard } = load('components/owned-library-book-card.tsx');
  const props = { title: 'Morning Notes · A long title', sentences: 12, chapters: null, completed: 2,
    editing: false, installed: true, busy: false, storage: { installed: true, bytes: 100, busy: false }, storageFailed: false,
    onStudy() { studies++; }, onDownload() { downloads++; }, onRemove() { removals++; }, onRetryStorage() { retries++; } };
  const nodes = runtime.render(React.createElement(OwnedLibraryBookCard, props));
  const cover = nodes.find(n => n.type === 'Image' && n.props.contentFit === 'cover')!;
  assert.equal(cover.props.style.width, '100%', 'Cover must span the card instead of sharing a row with its details');
  assert.equal(cover.props.style.aspectRatio, 3 / 4);
  const card = nodes.find(n => Array.isArray(n.props.style) && n.props.style[0]?.borderWidth === 2)!;
  const cardStyle = Object.assign({}, ...card.props.style);
  assert.equal(cardStyle.padding, 0, 'Cover must meet the card edges');
  assert.equal(cardStyle.overflow, 'hidden', 'The card clips its cover to the rounded corners');
  assert.equal(nodes.find(n => n.type === 'Text' && n.props.children === props.title)!.props.style.fontSize, 18);
  const sentenceCount = nodes.find(n => n.type === 'Text' && [n.props.children].flat().join('') === '총 12문장');
  assert.ok(sentenceCount, 'Only the total sentence count appears below the title');
  assert.equal(sentenceCount.props.style.fontSize, 12);
  const progressRow = nodes.find(n => n.type === 'View' && n.props.style?.flexDirection === 'row'
    && React.Children.toArray(n.props.children).some(child => React.isValidElement<{ children?: React.ReactNode }>(child)
      && [child.props.children].flat().join('') === '2/16'))!;
  assert.equal(progressRow.props.style.alignItems, 'center');
  assert.equal(nodes.find(n => n.type === 'Text' && [n.props.children].flat().join('') === '2/16')!.props.style.fontSize, 12);
  const details = nodes.find(n => n.type === 'View' && n.props.style?.padding === 12)!;
  const metadata = React.Children.toArray(details.props.children)[0] as React.ReactElement<{ style: { gap: number } }>;
  assert.equal(metadata.props.style.gap, 6);
  assert.equal(details.props.style.gap, metadata.props.style.gap,
    'Progress-to-action spacing matches sentence-count-to-progress spacing');
  const tags = nodes.find(n => n.type === 'View' && n.props.style?.position === 'absolute'
    && n.props.style?.right === 8 && n.props.style?.top === 8);
  assert.ok(tags, 'Tags overlay the upper-right corner of the cover');
  assert.equal(tags.props.style.alignItems, 'flex-end');
  const badges = nodes.filter(n => n.type === 'View' && n.props.style?.paddingHorizontal === 10 && n.props.style?.borderRadius === 10);
  assert.equal(badges.length, 2);
  for (const badge of badges) assert.equal(badge.props.style.paddingVertical, 2.5, 'Cover tags use half the original vertical inset');
  for (const caption of ['샘플', '1,728 XP +']) {
    const tag = nodes.find(n => n.type === 'Text' && [n.props.children].flat().join('') === caption)!;
    assert.equal(tag.props.style.fontSize, 13, 'Cover tags retain their existing text size');
  }
  const actionStyle = runtime.find('학습하기').style({ pressed: false });
  assert.ok(actionStyle.minHeight >= 44, 'Compact actions keep a usable tap target');
  const actionSurface = React.Children.only(runtime.find('학습하기').children) as React.ReactElement<{ style: { minHeight: number; paddingVertical: number } }>;
  assert.equal(actionSurface.props.style?.minHeight, 32, 'Only the visible surface shrinks, not the touch target');
  assert.equal(actionSurface.props.style.paddingVertical, 2);
  assert.equal(actionStyle.justifyContent, 'flex-end', 'The visible button ends at the touch target bottom');
  const actionRow = nodes.find(n => n.type === 'View' && n.props.style?.minHeight === 44
    && n.props.style?.justifyContent === 'center')!;
  const visibleActionGap = details.props.style.gap + (actionRow.props.style.marginTop ?? 0)
    + actionStyle.minHeight - actionSurface.props.style.minHeight;
  assert.equal(visibleActionGap, metadata.props.style.gap,
    'The visible button, not just its invisible touch target, has the same preceding gap as the progress row');
  assert.equal(details.props.style.paddingBottom ?? details.props.style.padding,
    details.props.style.paddingHorizontal ?? details.props.style.padding,
    'The bottom inset matches the left and right insets');
  assert.equal(runtime.find('도서 스테이지 진행').accessibilityValue.now, 2);
  const iconOnly = (label: string, symbol: string) => {
    assert.ok(runtime.find(label), 'Icon-only actions retain their accessible names');
    assert.ok(!runtime.flush().some(n => n.type === 'Text' && [n.props.children].flat().join('').replace('\n', ' ') === label));
    const icon = runtime.flush().find(n => n.type === 'Image' && n.props.source === `sf:${symbol}`)!;
    assert.equal(icon.props.style.width, 16, 'Card action icons stay compact');
    const iconSlot = runtime.flush().find(n => React.isValidElement<{ name?: string }>(n.props.children)
      && n.props.children.props.name === symbol)!;
    assert.equal(iconSlot.props.style.transform?.[0]?.translateY ?? 0, symbol === 'square.and.arrow.down' ? -2 : 0,
      'Optically center the bottom-heavy download symbol without shifting other action icons');
  };
  iconOnly('학습하기', 'play.fill');
  runtime.find('학습하기').onPress(); assert.equal(studies, 1);
  runtime.render(React.createElement(OwnedLibraryBookCard, { ...props, installed: false, storage: null }));
  iconOnly('다운로드', 'square.and.arrow.down');
  runtime.find('다운로드').onPress(); assert.equal(downloads, 1);
  runtime.render(React.createElement(OwnedLibraryBookCard, { ...props, storageFailed: true }));
  iconOnly('다시 확인', 'arrow.clockwise');
  runtime.find('다시 확인').onPress(); assert.equal(retries, 1);
  runtime.render(React.createElement(OwnedLibraryBookCard, { ...props, editing: true }));
  iconOnly('학습 자료 삭제', 'trash');
  runtime.find('학습 자료 삭제').onPress(); assert.equal(removals, 0);
  confirmation!.find(button => button.style === 'destructive').onPress(); assert.equal(removals, 1);
  const progress = runtime.render(React.createElement(OwnedLibraryBookCard, { ...props, busy: true,
    download: { progress: 0.5, label: '다운로드 중… 50%', canCancel: true }, onCancel() { cancellations++; } }));
  assert.equal(runtime.find('레슨 다운로드 진행').accessibilityValue.now, 50);
  assert.ok(progress.some(n => n.type === 'Text' && n.props.children === '50%'), 'Show only the download percentage');
  assert.ok(!progress.some(n => n.type === 'Text' && String(n.props.children).includes('다운로드 중')));
  assert.equal(runtime.find('레슨 다운로드 진행').accessibilityValue.text, '다운로드 중… 50%',
    'Screen readers retain the full download status');
  const downloadRow = progress.find(n => React.Children.toArray(n.props.children).some(child =>
    React.isValidElement<{ accessibilityLabel?: string }>(child) && child.props.accessibilityLabel === '다운로드 취소'))!;
  assert.equal(downloadRow.props.style.flexDirection, 'row', 'Cancel sits to the right of download progress');
  assert.equal(downloadRow.props.style.alignItems, 'center');
  assert.equal(runtime.find('레슨 다운로드 진행').style.flex, 1, 'Progress uses the space left beside Cancel');
  assert.equal(runtime.find('레슨 다운로드 진행').style.minWidth, 0, 'Long status text can wrap');
  const cancelStyle = runtime.find('다운로드 취소').style({ pressed: false });
  assert.ok(cancelStyle.minWidth >= 44 && cancelStyle.minHeight >= 44);
  assert.equal(progress.find(n => n.type === 'Image' && n.props.source === 'sf:xmark')!.props.style.width, 16);
  assert.equal(runtime.find('학습하기').disabled, true);
  runtime.find('다운로드 취소').onPress(); assert.equal(cancellations, 1);
  runtime.render(React.createElement(OwnedLibraryBookCard, { ...props, busy: true,
    download: { progress: 1, label: '설치 확인 중…', canCancel: false }, onCancel() { cancellations++; } }));
  assert.equal(runtime.find('다운로드 취소').disabled, true);
  runtime.find('다운로드 취소').onPress(); assert.equal(cancellations, 1);
  runtime.dispose();
});

test('each grid row reserves the tallest natural title height and updates when wrapping changes', () => {
  const { runtime, load } = fixture();
  const { LibraryGrid, LibraryGridItem } = load('components/library-grid.tsx');
  const { OwnedLibraryBookCard } = load('components/owned-library-book-card.tsx');
  const props = { sentences: 12, chapters: null, completed: 0, editing: false, installed: true, busy: false,
    storage: { installed: true, bytes: 100, busy: false }, storageFailed: false,
    onStudy() {}, onDownload() {}, onRemove() {}, onRetryStorage() {} };
  runtime.render(React.createElement(LibraryGrid, null, ...['Short', 'A longer title', 'Next row'].map(title =>
    React.createElement(LibraryGridItem, { key: title }, React.createElement(OwnedLibraryBookCard, { ...props, title })))));
  const measures = () => runtime.flush().filter(n => n.type === 'View' && typeof n.props.onLayout === 'function');
  assert.equal(measures().length, 3, 'Each title reports its own natural height');
  const measure = (index: number, height: number) => measures()[index]!.props.onLayout({ nativeEvent: { layout: { height } } });
  const heights = () => runtime.flush().filter(n => n.type === 'View'
    && React.isValidElement<{ onLayout?: unknown }>(n.props.children)
    && typeof n.props.children.props.onLayout === 'function').map(n => n.props.style.minHeight);
  measure(0, 22); measure(1, 44); measure(2, 22);
  assert.deepEqual(heights(), [44, 44, 22]);
  measure(1, 22);
  assert.deepEqual(heights(), [22, 22, 22], 'Shorter wrapping must remove stale extra space');
  measure(2, 66);
  assert.deepEqual(heights(), [22, 22, 66], 'A taller title affects only its own row');
  measure(0, 66); measure(1, 88);
  assert.deepEqual(heights(), [88, 88, 66], 'Larger text can grow the shared title area without truncation');
  runtime.dispose();
});
