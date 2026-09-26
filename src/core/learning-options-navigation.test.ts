import assert from 'node:assert/strict';
import test from 'node:test';
import React from 'react';
import { nativeHooks } from '../test-support/native-hooks';
import { nativeModules } from '../test-support/native-render';
import { nativeOptionsStack } from '../test-support/native-options-stack';
import type { LearningOptionsNavigation, LearningOptionsPage } from '../components/learning-options-stack';

test('menu uses native push/pop, preserves its mounted owner and synchronizes the visible page', t => {
  for (const reduced of [false, true]) {
    const runtime = nativeHooks(); t.after(runtime.dispose);
    const load = nativeModules({ react: runtime.hooks,
      'expo-router/native-stack': nativeOptionsStack(runtime.hooks),
      'expo-router/react-navigation': { useIsFocused: () => true },
      'react-native-reanimated': { useReducedMotion: () => reduced },
    });
    const { LearningOptionsStack, backToLearningOptions } = load('components/learning-options-stack.tsx');
    const navigationRef: { current: LearningOptionsNavigation | null } = { current: null };
    let page: LearningOptionsPage | null = null;
    const onPageChange = (next: LearningOptionsPage | null) => { page = next; };
    const renderPage = (next: LearningOptionsPage | null) => React.createElement('Page', { name: next });
    const tree = React.createElement(LearningOptionsStack, { initialPage: null, navigationRef, onPageChange,
      backgroundColor: '#000', children: renderPage });
    const rendered = runtime.render(tree);
    const options = rendered.find(node => node.type === 'NativeOptionsStack')!.props.screenOptions;
    assert.equal(options.animation, reduced ? 'fade' : 'default');
    assert.equal(options.animationTypeForReplace, 'pop');
    assert.equal(options.headerShown, false, 'The parent retains a single native header');
    assert.ok(navigationRef.current);
    navigationRef.current.navigate('typography'); runtime.flush();
    assert.equal(page, 'typography');
    assert.equal(navigationRef.current.getState().index, 1);
    runtime.render(tree);
    assert.equal(page, 'typography', 'A settings update must not reset the navigation stack');
    backToLearningOptions(navigationRef.current); runtime.flush();
    assert.equal(page, null);
    assert.equal(navigationRef.current.getState().index, 0);
    runtime.render(null);
    assert.equal(navigationRef.current, null, 'Do not retain a dismissed native navigator');
  }
});

test('back from a directly opened speed editor replaces with the menu instead of dismissing the sheet', t => {
  const runtime = nativeHooks(); t.after(runtime.dispose);
  const load = nativeModules({ react: runtime.hooks, 'expo-router/native-stack': nativeOptionsStack(runtime.hooks),
    'expo-router/react-navigation': { useIsFocused: () => true },
    'react-native-reanimated': { useReducedMotion: () => false } });
  const { LearningOptionsStack, backToLearningOptions } = load('components/learning-options-stack.tsx');
  const navigationRef: { current: LearningOptionsNavigation | null } = { current: null };
  let page: LearningOptionsPage | null = 'reveal';
  runtime.render(React.createElement(LearningOptionsStack, { initialPage: 'reveal', navigationRef,
    onPageChange: (next: LearningOptionsPage | null) => { page = next; }, backgroundColor: '#000',
    children: () => null }));
  backToLearningOptions(navigationRef.current); runtime.flush();
  assert.equal(page, null);
  assert.equal(navigationRef.current!.getState().index, 0);
  navigationRef.current!.navigate('display'); runtime.flush();
  assert.equal(page, 'display');
});
