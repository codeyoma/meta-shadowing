import { Pressable, View } from 'react-native';
import type { Settings } from '@/core/settings';
import { PlaybackRateControl } from './playback-rate-control';
import { SpeakingSpeedControl } from './speaking-speed-control';
import { SettingsSection } from './settings-section';
import { useSettingsColors } from './settings-row';
import { Icon, Label } from './ui';

export type LearningPreference = 'display' | 'rate' | 'group' | 'wpm';

/** Shared editors; callers choose whether changes target preferences or a paused session. */
export function LearningPreferenceSection({ option, settings, onChange }: {
  option: LearningPreference;
  settings: Settings;
  onChange(patch: Partial<Settings>): void;
}) {
  const c = useSettingsColors();
  if (option === 'rate') return <SettingsSection title="배속" paddingVertical={8}>
    <PlaybackRateControl appearance="settings" showTitle={false} rate={settings.rate}
      onChange={rate => onChange({ rate: Number(rate.toFixed(2)) })} />
  </SettingsSection>;
  if (option === 'group') return <SettingsSection title="다구간 학습 사이즈" note="한 번에 학습할 문장 수예요. 다구간 학습시 적용됩니다.">
    <View style={{ flexDirection: 'row', gap: 8 }}>
      {([2, 3, 4] as const).map(size => <Pressable key={size} accessibilityRole="radio" accessibilityLabel={`${size}문장`}
        accessibilityState={{ selected: (settings.groupSize ?? 2) === size }} onPress={() => onChange({ groupSize: size })}
        style={({ pressed }) => ({ flex: 1, minHeight: 44, padding: 10, alignItems: 'center', justifyContent: 'center', borderRadius: 12,
          backgroundColor: (settings.groupSize ?? 2) === size ? '#007aff' : c.background, opacity: pressed ? 0.6 : 1 })}>
        <Label size={17} color={(settings.groupSize ?? 2) === size ? '#ffffff' : c.text}>{size}</Label>
      </Pressable>)}
    </View>
  </SettingsSection>;
  if (option === 'wpm') return <SettingsSection title="크레이지 스피킹" paddingVertical={4} note="각 항목을 눌러 WPM(분당 단어 수)을 바꿀 수 있어요. 크레이지 스피킹 학습시 적용됩니다.">
    <SpeakingSpeedControl speeds={settings.crazyWpm} onChange={crazyWpm => onChange({ crazyWpm })} />
  </SettingsSection>;
  return <SettingsSection title="학습 화면">
    <View style={{ flexDirection: 'row', gap: 16 }}>
      {(['bubble', 'list'] as const).map(view => {
        const selected = (settings.speechView ?? 'bubble') === view;
        const title = view === 'bubble' ? '버블로 보기' : '리스트로 보기';
        return <Pressable key={view} onPress={() => onChange({ speechView: view })} accessibilityRole="radio"
          accessibilityLabel={title} accessibilityState={{ selected }} style={({ pressed }) => ({ flex: 1, gap: 12, alignItems: 'center', opacity: pressed ? 0.6 : 1 })}>
          <View accessibilityElementsHidden style={{ width: '100%', height: 120, padding: 12, gap: 10,
            backgroundColor: c.background, borderRadius: 16, justifyContent: 'center' }}>
            {[0, 1, 2].map(index => <View key={index} style={{ alignSelf: view === 'bubble' && index === 1 ? 'flex-end' : 'flex-start',
              width: view === 'bubble' ? '80%' : '100%', padding: 8, borderRadius: view === 'bubble' ? 10 : 0,
              backgroundColor: view === 'bubble' ? index === 1 ? '#007aff' : c.group : 'transparent',
              borderBottomWidth: view === 'list' ? 1 : 0, borderBottomColor: c.separator }}>
              <View style={{ height: 3, width: '85%', backgroundColor: view === 'bubble' && index === 1 ? '#ffffff' : c.secondary, borderRadius: 2 }} />
            </View>)}
          </View>
          <Label size={16} color={c.text}>{title}</Label>
          <Icon name={selected ? 'checkmark.circle.fill' : 'circle'} size={26} color={selected ? '#007aff' : c.secondary} />
        </Pressable>;
      })}
    </View>
  </SettingsSection>;
}
