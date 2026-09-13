import { useEffect, useRef, useState } from 'react';
import { View } from 'react-native';
import Slider from '@react-native-community/slider';
import { Icon, Label, usePalette } from '@/components/ui';
import { useSettingsColors } from './settings-row';

/** Shared settings layout. The caller persists the rate and remounts on save failure. */
export function PlaybackRateControl({ rate, onChange, appearance = 'default', showTitle = true }: { rate: number; onChange: (rate: number) => void; appearance?: 'default' | 'settings'; showTitle?: boolean }) {
  const palette = usePalette(), settings = useSettingsColors();
  const compact = appearance === 'settings';
  const c = compact ? { ...palette, heading: settings.text, secondary: settings.secondary, line: settings.separator, accentPressed: '#007aff' } : palette;
  const [draftRate, setDraftRate] = useState(rate);
  const sliding = useRef(false);
  useEffect(() => { setDraftRate(rate); }, [rate]);
  function commit(value: number) {
    const next = Math.max(0.25, Math.min(3, Math.round(value * 4) / 4));
    setDraftRate(next);
    onChange(next);
  }
  return <View style={{ gap: compact ? 16 : 30 }}>
    {showTitle && <View style={{ flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 10 }}>
      <Icon name="speaker.wave.2.fill" color={c.heading} /><Label size={compact ? 17 : 21} weight={compact ? '400' : '700'} color={c.heading}>재생 속도</Label>
    </View>}
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 16, paddingBottom: 10 }}>
      <View style={{ flex: 1 }}>
      <Slider accessible accessibilityRole="adjustable" accessibilityLabel="재생 속도"
        accessibilityValue={{ min: 0.25, max: 3, now: draftRate, text: `${draftRate}배` }}
        accessibilityActions={[{ name: 'increment' }, { name: 'decrement' }]}
        onAccessibilityAction={({ nativeEvent }) => {
          if (nativeEvent.actionName === 'increment') commit((Math.floor(rate * 4) + 1) / 4);
          if (nativeEvent.actionName === 'decrement') commit((Math.ceil(rate * 4) - 1) / 4);
        }}
        value={rate} minimumValue={0.25} maximumValue={3} step={0.25} tapToSeek
        onSlidingStart={() => { sliding.current = true; }}
        onValueChange={value => {
          setDraftRate(Number(value.toFixed(2)));
          // VoiceOver adjustments emit value changes without touch start/end.
          if (!sliding.current) commit(value);
        }}
        onSlidingComplete={value => { sliding.current = false; commit(value); }}
        minimumTrackTintColor={c.accentPressed} maximumTrackTintColor={c.line}
        style={{ width: '100%', height: 48 }} />
      <View pointerEvents="none" accessibilityElementsHidden importantForAccessibility="no-hide-descendants"
        style={{ position: 'absolute', top: 48, left: 14, right: 14, height: 5 }}>
        {[0.25, 1, 2, 3].map(value => <View key={value} style={{ position: 'absolute',
          left: `${(value - 0.25) / 2.75 * 100}%`, width: 4, height: 4, borderRadius: 2,
          backgroundColor: c.secondary, transform: [{ translateX: -2 }] }} />)}
      </View>
      </View>
      <View style={{ minWidth: 62, minHeight: 48, alignItems: 'flex-end', justifyContent: 'center' }}>
        <Label size={compact ? 21 : 24} color={c.heading}>{draftRate}×</Label>
      </View>
    </View>
  </View>;
}
