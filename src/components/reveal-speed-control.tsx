import { View } from 'react-native';
import type { Session } from '@/core/session';
import type { Settings } from '@/core/settings';
import { normalizeSpeakingSpeeds } from '@/core/speaking-speed';
import type { RevealSpeed } from '@/core/word-reveal';
import { Label } from './ui';
import { SettingsSection } from './settings-section';
import { SystemPicker } from './system-picker';

export function RevealSpeedControl({ reveal, speeds, onChange }: {
  reveal: NonNullable<Session['reveal']>; speeds?: Settings['crazyWpm']; onChange(speed: RevealSpeed): void;
}) {
  const presets = normalizeSpeakingSpeeds(speeds);
  // A saved run keeps its WPM even when global presets change; allow reselecting its level.
  const selected = presets[reveal.speed - 1] === reveal.wpm ? reveal.speed : 0;
  return <SettingsSection title={`스피킹 속도 · S${reveal.speed}`}
    note="아래에서 WPM을 수정한 뒤 S1–S4를 다시 선택하면 현재 학습에 적용돼요.">
    <View style={{ gap: 12 }}>
      <SystemPicker label="스피킹 속도" value={selected}
        options={presets.map((_, index) => ({ value: index + 1, label: `S${index + 1}` }))}
        onChange={speed => onChange(speed as RevealSpeed)} />
      <Label size={15} muted align="center">{reveal.wpm} WPM</Label>
    </View>
  </SettingsSection>;
}
