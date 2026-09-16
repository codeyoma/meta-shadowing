import type { ReactNode } from 'react';
import { Text, View, useWindowDimensions, type TextStyle } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { phraseCounterText } from '@/core/player-presentation';
import { HeaderButton, ProgressTrack, usePalette } from './ui';

export function PlayerHeaderProgress({ current, total, completed, onOptions, unitLabel = '학습 구간', children }: { current: number; total: number; completed: number; onOptions(): void; unitLabel?: string; children?: ReactNode }) {
  const c = usePalette();
  const { fontScale } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const counter = phraseCounterText(current, total);
  const text: TextStyle = { fontSize: 15 * fontScale, lineHeight: 22 * fontScale,
    fontWeight: '700', fontVariant: ['tabular-nums'], color: c.text, textAlign: 'right' };
  return <View style={{ paddingTop: insets.top, backgroundColor: c.background }}>
    <View style={{ paddingLeft: 24 + insets.left, paddingRight: 24 + insets.right,
      minHeight: 44, flexDirection: 'row', alignItems: 'center', gap: 16 }}>
    <HeaderButton feedback={false} title="학습 옵션 열기" icon="slider.horizontal.3" onPress={onOptions} />
    <View style={{ flex: 1 }}><ProgressTrack label={`${unitLabel} 진행`} value={completed} total={total} shimmer animate /></View>
    <View accessible accessibilityLabel={`${unitLabel} ${counter.label}`} style={{ flexShrink: 0 }}>
      {/* Measure the largest digit slots during native layout, before displaying the current counter.
          Tabular numerals keep both the slot and remaining track width stable throughout a lesson. */}
      <Text accessible={false} accessibilityElementsHidden importantForAccessibility="no-hide-descendants"
        allowFontScaling={false} style={[text, { opacity: 0 }]}>{counter.measure}</Text>
      <Text accessible={false} selectable allowFontScaling={false} numberOfLines={1}
        style={[text, { position: 'absolute', inset: 0 }]}>{counter.label}</Text>
    </View>
    </View>
    {children && <View style={{ paddingLeft: 24 + insets.left, paddingRight: 24 + insets.right }}>{children}</View>}
  </View>;
}
