import { View } from 'react-native';
import { SettingsRow, useSettingsColors } from './settings-row';
import type { LearningPreference } from './learning-preference-section';

export const learningPreferenceMenus = [
  { option: 'display', title: '학습 화면', icon: 'text.bubble.fill' },
  { option: 'rate', title: '배속', icon: 'speaker.wave.2.fill' },
  { option: 'group', title: '다구간 학습', icon: 'square.grid.2x2.fill' },
  { option: 'wpm', title: '크레이지 스피킹', icon: 'speedometer' },
] as const;

export function LearningPreferenceMenu({ onSelect, disabled = false, rateDisabled = false }: {
  onSelect(option: LearningPreference): void;
  disabled?: boolean;
  rateDisabled?: boolean;
}) {
  const c = useSettingsColors();
  return <View style={{ borderRadius: 24, borderCurve: 'continuous', overflow: 'hidden', backgroundColor: c.group }}>
    {learningPreferenceMenus.map((menu, index) => <SettingsRow key={menu.option} title={menu.title} icon={menu.icon} iconColor="#007aff"
      disclosure separator={index < learningPreferenceMenus.length - 1} disabled={disabled || (menu.option === 'rate' && rateDisabled)}
      onPress={() => onSelect(menu.option)} />)}
  </View>;
}
