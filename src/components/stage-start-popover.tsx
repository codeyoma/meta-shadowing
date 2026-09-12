import { useState } from 'react';
import { View, useWindowDimensions } from 'react-native';
import Animated, { Easing, FadeIn, ReduceMotion } from 'react-native-reanimated';
import { FeedbackPressable } from './feedback-pressable';
import { Label, usePalette } from './ui';
import { methodNames } from './method-label';

export type StageAnchor = { stage: number; x: number; top: number; bottom: number; label: string; above: boolean };
const ENTER = FadeIn.duration(140).easing(Easing.bezier(0.23, 1, 0.32, 1)).reduceMotion(ReduceMotion.System);

export function StageStartPopover({ anchor, width, onClose, onStart }: {
  anchor: StageAnchor; width: number; onClose(): void; onStart(stage: number): void;
}) {
  const c = usePalette();
  const { fontScale } = useWindowDimensions();
  const [measuredHeight, setMeasuredHeight] = useState(0);
  const cardWidth = Math.min(360, width - 24);
  const left = Math.max(12, Math.min(anchor.x - cardWidth / 2, width - cardWidth - 12));
  const cardHeight = measuredHeight || 64 + 58 * fontScale;
  const below = !anchor.above;
  const top = below ? anchor.bottom + 14 : Math.max(12, anchor.top - cardHeight - 14);
  const level = Math.ceil(anchor.stage / 2);
  // Content coordinates keep the popup attached without intercepting native scrolling.
  return <Animated.View entering={ENTER} onAccessibilityEscape={onClose}
        onLayout={event => setMeasuredHeight(event.nativeEvent.layout.height)}
        style={{ position: 'absolute', zIndex: 2, left, top, width: cardWidth, padding: 14, gap: 12,
          borderRadius: 18, borderCurve: 'continuous', backgroundColor: c.accentPressed,
          boxShadow: '0 8px 20px rgba(4,44,96,0.15)' }}>
        <View pointerEvents="none" style={{ position: 'absolute', left: Math.max(20, Math.min(cardWidth - 36, anchor.x - left - 8)),
          ...(below ? { top: -8 } : { bottom: -8 }), width: 16, height: 16,
          backgroundColor: c.accentPressed, transform: [{ rotate: '45deg' }] }} />
        <Label size={16} weight="800" color="#ffffff">STAGE {String(anchor.stage).padStart(2, '0')} · Lv {level} {methodNames[level - 1]}</Label>
        <FeedbackPressable accessibilityRole="button" accessibilityLabel={`Stage ${anchor.stage} ${anchor.label}`}
          onPress={() => { onClose(); onStart(anchor.stage); }}
          style={({ pressed }) => ({ minHeight: 48, paddingVertical: 12, paddingHorizontal: 16,
            borderRadius: 12, alignItems: 'center', justifyContent: 'center', backgroundColor: '#ffffff',
            transform: [{ translateY: pressed ? 3 : 0 }], boxShadow: pressed ? 'none' : '0 3px 0 rgba(255,255,255,0.5)' })}>
          <Label size={16} weight="800" color="#c75a00">{anchor.label}</Label>
        </FeedbackPressable>
      </Animated.View>;
}
