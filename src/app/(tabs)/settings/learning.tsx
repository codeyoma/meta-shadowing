import { useEffect, useRef, useState } from 'react';
import { Alert, ScrollView, View } from 'react-native';
import Slider from '@react-native-community/slider';
import { Label, Icon, usePalette } from '@/components/ui';
import { readSettings, saveSettings, type Settings } from '@/native/settings';

export default function LearningSettingsScreen() {
  const c = usePalette();
  const [settings, setSettings] = useState<Settings | null>(null);
  const [draftRate, setDraftRate] = useState(1);
  const sliding = useRef(false);
  const [sliderRevision, setSliderRevision] = useState(0);
  useEffect(() => {
    try { const saved = readSettings(); setSettings(saved); setDraftRate(saved.rate); }
    catch { Alert.alert('설정을 읽을 수 없어요', '저장 공간을 확인하고 앱을 다시 열어 주세요.'); }
  }, []);
  function change(rate: number) {
    const next: Settings = { mode: 'manual', rate: Number(rate.toFixed(2)) };
    try { saveSettings(next); setSettings(next); setDraftRate(next.rate); }
    catch {
      setDraftRate(settings?.rate ?? 1);
      setSliderRevision(value => value + 1);
      Alert.alert('설정을 저장하지 못했어요', '저장 공간을 확인하고 다시 시도해 주세요.');
    }
  }
  return <ScrollView contentInsetAdjustmentBehavior="automatic" contentContainerStyle={{ padding: 24, gap: 30, paddingBottom: 40 }}>
    <View style={{ flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 10 }}>
      <Icon name="speaker.wave.2.fill" /><Label size={21} weight="700" color={c.heading}>음성 속도</Label>
    </View>
    {settings && <View style={{ gap: 12 }}>
      <Label size={30} display color={c.heading} align="center">{draftRate}×</Label>
      <Slider key={sliderRevision} accessible accessibilityRole="adjustable" accessibilityLabel="음성 속도"
        accessibilityValue={{ min: 0.25, max: 3, now: draftRate, text: `${draftRate}배` }}
        accessibilityActions={[{ name: 'increment' }, { name: 'decrement' }]}
        onAccessibilityAction={({ nativeEvent }) => {
          if (nativeEvent.actionName === 'increment') change(Math.min(3, settings.rate + 0.05));
          if (nativeEvent.actionName === 'decrement') change(Math.max(0.25, settings.rate - 0.05));
        }}
        value={settings.rate} minimumValue={0.25} maximumValue={3} step={0.05} tapToSeek
        onSlidingStart={() => { sliding.current = true; }}
        onValueChange={value => {
          setDraftRate(Number(value.toFixed(2)));
          // VoiceOver adjustments emit value changes without touch start/end.
          if (!sliding.current) change(value);
        }}
        onSlidingComplete={value => { sliding.current = false; change(value); }}
        minimumTrackTintColor={c.accentPressed} maximumTrackTintColor={c.line}
        style={{ width: '100%', height: 48 }} />
      <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
        <Label size={14} muted>0.25×</Label><Label size={14} muted>3×</Label>
        {/* Match the native slider library's step-marker inset; positions follow the rate range, not equal spacing. */}
        <View pointerEvents="none" style={{ position: 'absolute', left: '5%', right: '5%', top: 0, bottom: 0 }}>
          {[1, 2].map(rate => <View key={rate} style={{ position: 'absolute',
            left: `${(rate - 0.25) / (3 - 0.25) * 100}%`, alignItems: 'center', transform: [{ translateX: '-50%' }] }}>
            <View style={{ position: 'absolute', top: -8, width: 2, height: 5, backgroundColor: c.secondary }} />
            <Label size={14} muted>{rate}×</Label>
          </View>)}
        </View>
      </View>
    </View>}
  </ScrollView>;
}
