import { useMemo } from 'react';
import { Text, useWindowDimensions } from 'react-native';
import { isLoaded } from 'expo-font';
import Animated, { cubicBezier, useReducedMotion } from 'react-native-reanimated';
import { subtitleSpans } from '@/core/subtitle-mask';

const REVEAL_EASING = cubicBezier(0.23, 1, 0.32, 1);

/** Stable native text layout: reveal changes ink only, never characters or sizing. */
export function SubtitleText({ text, masked, background, color, size, display = false, weight = '500' }: {
  text: string; masked: boolean; background: string; color: string; size: number;
  display?: boolean; weight?: '400' | '500' | '700';
}) {
  const { fontScale } = useWindowDimensions();
  const reduced = useReducedMotion();
  const spans = useMemo(() => subtitleSpans(text), [text]);
  const rounded = display && isLoaded('Nunito_800ExtraBold');
  const accessibleText = masked ? spans.filter(span => span.hint).map(span => span.text).join(' … ') : text;
  return <Text accessible accessibilityLabel={accessibleText} selectable={!masked} allowFontScaling={false}
    style={{ color, fontSize: size * fontScale, fontFamily: rounded ? 'Nunito_800ExtraBold' : undefined,
      fontWeight: rounded ? undefined : weight, lineHeight: size * fontScale * (display ? 1.2 : 1.45), flexShrink: 1 }}>
    {spans.map((span, index) => <Animated.Text key={index} accessible={false} style={{
      color: masked && !span.hint ? background : color,
      transitionProperty: 'color', transitionDuration: reduced ? 0 : 180,
      transitionTimingFunction: REVEAL_EASING,
    }}>{span.text}</Animated.Text>)}
  </Text>;
}
