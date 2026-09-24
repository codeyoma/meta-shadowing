import { useEffect, useRef, useState } from 'react';
import { AppState, Linking, Switch, View } from 'react-native';
import Slider from '@react-native-community/slider';
import { ActionButton, Label } from './ui';
import { SettingsSection } from './settings-section';
import { useSettingsColors } from './settings-row';
import { monitorPresentation, type MonitorStatus } from '@/core/voice-monitor-lab';
import { learningMonitor, learningMonitorSupported, monitorNative } from '@/native/voice-monitor';
import { sliderReleaseValue, sliderValue } from '@/core/slider-value';

const volumeRange = { min: 0, max: 1, step: 0.05 };

export function LearningMonitorControls({ sessionKey, allowed }: { sessionKey?: string; allowed: boolean }) {
  const c = useSettingsColors();
  const [status, setStatus] = useState<MonitorStatus | null>(null);
  const [draftGain, setDraftGain] = useState<number | null>(null);
  const displayedGain = useRef<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  useEffect(() => {
    if (!monitorNative) return;
    let alive = true, revision = 0;
    const refresh = async () => {
      const epoch = ++revision;
      try {
        const next = await monitorNative!.monitorStatus();
        if (alive && epoch === revision) setStatus(next);
      } catch { if (alive) setError('메뉴를 다시 열어 주세요.'); }
    };
    const changes = monitorNative.addListener('onMonitorStatus', next => { revision++; if (alive) setStatus(next); });
    const app = AppState.addEventListener('change', next => { if (next === 'active') void refresh(); });
    void refresh();
    return () => { alive = false; changes.remove(); app.remove(); };
  }, [sessionKey]);
  async function action(work: () => Promise<unknown>) {
    setError(''); setBusy(true);
    try { await work(); setStatus(await monitorNative!.monitorStatus()); }
    catch { setError('이어폰 연결을 확인하고 다시 시도해 주세요.'); }
    finally { setBusy(false); }
  }
  const current = learningMonitor(sessionKey);
  const on = status?.state === 'monitoring';
  const view = status && monitorPresentation(learningMonitorSupported, status.state, status.output, 'compact');
  const gain = status?.gain ?? 0.25;
  const displayedPercent = Math.round((draftGain ?? gain) * 100);
  return <View style={{ gap: 16 }}>
    <SettingsSection paddingVertical={10} note={view?.message || undefined}>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
        <Label size={17} weight="400" color={c.text}>내 목소리 듣기</Label>
        <Switch accessibilityLabel="내 목소리 듣기" value={on}
          disabled={busy || !current || !status || (!on && (!allowed || !view?.canEnable))}
          onValueChange={enabled => void action(async () => {
            const owner = learningMonitor(sessionKey);
            if (!owner || (enabled && !allowed)) throw Error('Learning session unavailable.');
            if (enabled) await owner.enable(); else await owner.disable();
          })} />
      </View>
      {status?.state === 'denied' && <ActionButton title="마이크 권한 설정" onPress={() => void Linking.openSettings()} />}
    </SettingsSection>
    <SettingsSection title="내 목소리 음량" paddingVertical={8}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 16, paddingBottom: 10 }}>
        <View style={{ flex: 1 }}>
        <Slider accessibilityLabel="내 목소리 음량" accessibilityRole="adjustable"
          accessibilityValue={{ min: 0, max: 100, now: displayedPercent, text: `${displayedPercent}%` }}
          minimumValue={0} maximumValue={1} step={0.05}
          value={gain} disabled={busy || !current || !status}
          onSlidingStart={() => { displayedGain.current = null; }}
          onValueChange={value => {
            const next = sliderValue(value, volumeRange);
            displayedGain.current = next;
            setDraftGain(next);
          }}
          onSlidingComplete={value => {
            const next = sliderReleaseValue(displayedGain.current, value, volumeRange);
            displayedGain.current = null;
            setDraftGain(next);
            void action(() => monitorNative!.setMonitorGain(next)).finally(() => setDraftGain(null));
          }}
          minimumTrackTintColor="#007aff" maximumTrackTintColor={c.separator}
          style={{ width: '100%', height: 48 }} />
        <View pointerEvents="none" accessibilityElementsHidden importantForAccessibility="no-hide-descendants"
          style={{ position: 'absolute', top: 48, left: 14, right: 14, height: 5 }}>
          {[0, 25, 50, 75, 100].map(percent => <View key={percent} style={{ position: 'absolute',
            left: `${percent}%`, width: 4, height: 4, borderRadius: 2,
            backgroundColor: c.secondary, transform: [{ translateX: -2 }] }} />)}
        </View>
        </View>
        <View style={{ minWidth: 62, minHeight: 48, alignItems: 'flex-end', justifyContent: 'center' }}>
          <Label size={21} color={c.text}>{displayedPercent}%</Label>
        </View>
      </View>
    </SettingsSection>
    {!!error && <Label size={13} color={c.text}>{error}</Label>}
  </View>;
}
