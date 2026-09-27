import test from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import { nativeHooks } from '../test-support/native-hooks';
import { nativeModules, nativeMotion } from '../test-support/native-render';
import { nativeFontMenu, nativeFontMenuModifiers } from '../test-support/native-font-menu';

const languages = [
  { id: 'english', name: 'English', flag: '🇬🇧', displayCode: 'EN' },
  { id: 'japanese', name: '日本語', flag: '🇯🇵', displayCode: 'JP' },
];

for (const language of languages) for (const fontScale of [1, 1.5]) {
  test(`${language.displayCode} centers header visuals while keeping captions bottom-aligned at ${fontScale}x text size`, t => {
    const runtime = nativeHooks(); t.after(runtime.dispose);
    const selections: unknown[] = [];
    const load = nativeModules({ react: runtime.hooks,
      'react-native': { View: 'View', Text: 'Text', useColorScheme: () => 'light', useWindowDimensions: () => ({ fontScale }) },
      'react-native-safe-area-context': { useSafeAreaInsets: () => ({ top: 62, right: 0, bottom: 34, left: 0 }) },
      'react-native-reanimated': nativeMotion, 'expo-image': { Image: 'Image' }, 'expo-font': { isLoaded: () => true },
      'expo-router': { usePathname: () => '/' }, '@/native/tap-feedback': { tapFeedback() {} },
      '@expo/ui/swift-ui': { ...nativeFontMenu, Text: 'SwiftText', VStack: 'VStack', Picker: 'Picker' },
      '@expo/ui/swift-ui/modifiers': { ...nativeFontMenuModifiers,
        offset: (value: unknown) => ({ $type: 'offset', value }), pickerStyle: () => ({}), tag: () => ({}) },
      '@/native/catalog': { languages },
      '@/components/library-context': { useLibrary: () => ({ selection: { language: language.id },
        select: (value: unknown) => { selections.push(value); return true; },
        progress: { summary: { current: 53, required: 100, level: 2, streak: 0, maxLevel: false } } }) },
    });
    const { StudyHeader } = load('components/study-header.tsx');
    const nodes = runtime.render(React.createElement(StudyHeader));
    const row = nodes.find(n => n.props.style?.paddingHorizontal === 24)!;
    assert.equal(row.props.style.alignItems, 'flex-end', 'Columns share the bottom edge rather than their centers');
    const trigger = nodes.find(n => n.props.onTouchStart)!;
    assert.equal(trigger.props.style.alignSelf, 'stretch');
    assert.equal(trigger.props.style.justifyContent, 'flex-start', 'The flag row starts at the same top edge as XP and streak');
    const stack = nodes.find(n => n.type === 'VStack')!;
    assert.equal(stack.props.modifiers.find((m: any) => m.$type === 'frame').value.alignment, 'top');
    const flag = nodes.find(n => n.type === 'SwiftText' && n.props.children === language.flag)!;
    const flagFrame = flag.props.modifiers.find((m: any) => m.$type === 'frame')?.value;
    assert.ok(flagFrame, 'The flag uses an explicit visual-row frame');
    assert.equal(flagFrame.alignment, 'center');
    assert.ok(flagFrame.height >= 28 * fontScale, 'The row accommodates the scaled flag');
    for (const childProps of [{ label: `${language.name} 다음 레벨 경험치` }, { name: 'flame.fill' }]) {
      const slot = nodes.find(n => n.type === 'View' && React.isValidElement<Record<string, unknown>>(n.props.children)
        && Object.entries(childProps).every(([key, value]) => n.props.children.props[key] === value));
      assert.ok(slot, 'XP and flame each have a visual-row slot');
      assert.equal(slot.props.style.height, flagFrame.height, 'All three visuals share one row height');
      assert.equal(slot.props.style.justifyContent, 'center', 'Short and tall visuals share the same vertical center');
    }
    for (const column of nodes.filter(n => n.props.style?.alignSelf === 'stretch')) {
      assert.equal(column.props.style.paddingTop ?? 0, 0, 'No independent top inset offsets a visual column');
    }
    const code = nodes.find(n => n.type === 'Text' && n.props.children === language.displayCode);
    assert.ok(code, 'Use the same native text renderer as the neighboring numbers to share font metrics');
    const streak = nodes.find(n => n.type === 'Text' && n.props.children === 0)!;
    for (const property of ['fontFamily', 'fontSize', 'lineHeight']) {
      assert.equal(code.props.style[property], streak.props.style[property]);
    }
    assert.equal(code.props.style.fontSize, 12 * fontScale);
    const caption = nodes.find(n => n.props.pointerEvents === 'none' && n.props.style?.bottom === 0)!;
    assert.ok(caption, 'Align the language caption to the shared bottom edge without shifting glyphs');
    assert.equal(caption.props.accessibilityElementsHidden, true, 'The native menu already announces the language');
    assert.ok(nodes.some(n => n.props.children === '53 / 100 XP'));
    const host = nodes.find(n => n.type === 'Host')!;
    assert.ok(host.props.style.minWidth >= 44 && host.props.style.minHeight >= 44, 'Keep the native menu touch target');
    const other = languages.find(item => item.id !== language.id)!;
    nodes.find(n => n.type === 'Picker')!.props.onSelectionChange(other.id);
    assert.deepEqual(selections.map(value => ({ ...value as object })), [{ language: other.id, book: null }]);
  });
}
