import { View } from 'react-native';
import type { Settings } from '@/core/settings';
import { PlaybackRateControl } from './playback-rate-control';
import { SpeakingSpeedControl } from './speaking-speed-control';
import { SettingsSection } from './settings-section';
import { useSettingsColors } from './settings-row';
import { SystemPicker } from './system-picker';
import { FeedbackPressable } from './feedback-pressable';
import { LearningTypographyControl } from './learning-typography-control';

export type LearningPreference = 'display' | 'rate' | 'group' | 'wpm';

/** Shared editors; callers choose whether changes target preferences or a paused session. */
export function LearningPreferenceSection({ option, settings, onChange, activeGroup = false }: {
  option: LearningPreference;
  settings: Settings;
  onChange(patch: Partial<Settings>): boolean | void;
  activeGroup?: boolean;
}) {
  const c = useSettingsColors();
  if (option === 'rate') return <SettingsSection title="배속" paddingVertical={8}>
    <PlaybackRateControl appearance="settings" showTitle={false} rate={settings.rate}
      onChange={rate => onChange({ rate: Number(rate.toFixed(2)) })} />
  </SettingsSection>;
  if (option === 'group') return <SettingsSection title="다구간 학습 사이즈" note={activeGroup
    ? '바로 적용돼요. 완료한 학습과 XP는 유지하고, 현재 묶음은 처음부터 재생해요.'
    : '7–10 스테이지의 기본 묶음 크기예요. 진행 중인 학습은 학습 메뉴에서 바꿀 수 있어요.'}>
    <SystemPicker label="다구간 학습 사이즈" value={settings.groupSize ?? 2}
      options={([2, 3, 4] as const).map(value => ({ value, label: `${value}구간` }))}
      onChange={groupSize => onChange({ groupSize })} />
  </SettingsSection>;
  if (option === 'wpm') return <SettingsSection title="크레이지 스피킹" paddingVertical={4} note="각 항목을 눌러 WPM(분당 단어 수)을 바꿀 수 있어요. 크레이지 스피킹 학습시 적용됩니다.">
    <SpeakingSpeedControl speeds={settings.crazyWpm} onChange={crazyWpm => onChange({ crazyWpm })} />
  </SettingsSection>;
  return <><SettingsSection title="학습 화면">
    <View style={{ flexDirection: 'row', gap: 16 }}>
      {(['bubble', 'list'] as const).map(view => {
        const selected = (settings.speechView ?? 'bubble') === view;
        return <FeedbackPressable key={view} feedback={false} accessibilityRole="radio"
          accessibilityLabel={view === 'bubble' ? '버블로 보기' : '리스트로 보기'} accessibilityState={{ checked: selected }}
          onPress={() => { if (!selected) onChange({ speechView: view }); }}
          style={({ pressed }) => ({ flex: 1, borderRadius: 16, opacity: pressed ? 0.7 : 1 })}>
          <View pointerEvents="none" accessibilityElementsHidden importantForAccessibility="no-hide-descendants"
            style={{ width: '100%', height: 120, padding: 10, gap: 10, borderWidth: 2,
              borderColor: selected ? c.secondary : 'transparent',
              backgroundColor: c.background, borderRadius: 16, justifyContent: 'center' }}>
            {[0, 1, 2].map(index => <View key={index} style={{ alignSelf: view === 'bubble' && index === 1 ? 'flex-end' : 'flex-start',
              width: view === 'bubble' ? '80%' : '100%', padding: 8, borderRadius: view === 'bubble' ? 10 : 0,
              backgroundColor: view === 'bubble' ? index === 1 ? '#007aff' : c.group : 'transparent',
              borderBottomWidth: view === 'list' ? 1 : 0, borderBottomColor: c.separator }}>
              <View style={{ height: 3, width: '85%', backgroundColor: view === 'bubble' && index === 1 ? '#ffffff' : c.secondary, borderRadius: 2 }} />
            </View>)}
          </View>
        </FeedbackPressable>;
      })}
    </View>
    <SystemPicker label="학습 화면" value={settings.speechView ?? 'bubble'}
      options={[{ value: 'bubble', label: '버블로 보기' }, { value: 'list', label: '리스트로 보기' }] as const}
      onChange={speechView => onChange({ speechView })} />
  </SettingsSection><LearningTypographyControl settings={settings} onChange={onChange} /></>;
}
