import { Text, View, useWindowDimensions, type TextStyle } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { phraseCounterText } from '@/core/player-presentation';
import { HeaderButton, ProgressTrack, usePalette } from './ui';

export function PlayerHeaderProgress({ current, total, completed, onOptions }: { current: number; total: number; completed: number; onOptions(): void }) {
  const c = usePalette();
  const { fontScale } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const counter = phraseCounterText(current, total);
  const text: TextStyle = { fontSize: 15 * fontScale, lineHeight: 22 * fontScale,
    fontWeight: '700', fontVariant: ['tabular-nums'], color: c.text, textAlign: 'right' };
  return <View style={{ paddingTop: insets.top, paddingBottom: 10, backgroundColor: c.background }}>
    <View style={{ paddingLeft: 24 + insets.left, paddingRight: 24 + insets.right,
      minHeight: 44, flexDirection: 'row', alignItems: 'center', gap: 16 }}>
    <HeaderButton feedback={false} title="학습 옵션 열기" icon="slider.horizontal.3" onPress={onOptions} />
    <View style={{ flex: 1 }}><ProgressTrack label="문장 진행" value={completed} total={total} shimmer /></View>
    <View accessible accessibilityLabel={`문장 ${counter.label}`} style={{ flexShrink: 0 }}>
      {/* Measure the largest digit slots during native layout, before displaying the current counter.
          Tabular numerals keep both the slot and remaining track width stable throughout a lesson. */}
      <Text accessible={false} accessibilityElementsHidden importantForAccessibility="no-hide-descendants"
        allowFontScaling={false} style={[text, { opacity: 0 }]}>{counter.measure}</Text>
      <Text accessible={false} selectable allowFontScaling={false} numberOfLines={1}
        style={[text, { position: 'absolute', inset: 0 }]}>{counter.label}</Text>
    </View>
    </View>
  </View>;
}
