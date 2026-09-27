import test from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import { nativeHooks } from '../test-support/native-hooks';
import { nativeModules } from '../test-support/native-render';

function fixture() {
  const runtime = nativeHooks();
  const load = nativeModules({ react: runtime.hooks,
    'react-native': { View: 'View', ScrollView: 'ScrollView', Switch: 'Switch', AppState: { currentState: 'active' } },
    'expo-router': { Stack: { Screen: () => null }, router: { push() {} } },
    '@/components/ui': { Label: ({ children }: React.PropsWithChildren) => React.createElement('Text', null, children), Icon: 'Icon' },
    '@/components/settings-row': { SettingsRow: 'SettingsRow', useSettingsColors: () => ({ group: '#fff', text: '#000', secondary: '#888' }) },
    '@/components/restore-purchases': { RestorePurchases: () => null },
  });
  const Settings = load('app/(tabs)/settings/index.tsx').default;
  const render = () => runtime.render(React.createElement(Settings));
  render();
  return { runtime };
}

test('settings retains its existing sections without a launch-haptic switch', () => {
  const f = fixture();
  const nodes = f.runtime.flush();
  assert.deepEqual(nodes.filter(n => n.type === 'SettingsRow').map(n => n.props.title), ['학습 설정', 'iCloud 동기화', '데이터 관리']);
  assert.equal(nodes.some(n => n.type === 'Switch'), false);
  f.runtime.dispose();
});
