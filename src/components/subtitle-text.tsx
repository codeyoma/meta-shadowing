import { useEffect, useMemo, useRef } from 'react';
import { Text, View, findNodeHandle, useWindowDimensions } from 'react-native';
import { textFontStyle } from './text-font';
import Animated, { cubicBezier, useReducedMotion } from 'react-native-reanimated';
import { subtitleSpans } from '@/core/subtitle-mask';
import { lookupSpans, type LookupSpan } from '@/core/dictionary-words';
import { dictionary } from '../../modules/learning-dictionary';

const REVEAL_EASING = cubicBezier(0.23, 1, 0.32, 1);

/** Stable native text layout: reveal changes ink only, never characters or sizing. */
export type WordLookup = (term: string, focus: number | null) => Promise<void>;
export function SubtitleText({ text, masked, background, color, size, display = false, weight = '500', fontFamily, onLookup }: {
  text: string; masked: boolean; background: string; color: string; size: number;
  display?: boolean; weight?: '400' | '500' | '700'; fontFamily?: string;
  onLookup?: WordLookup;
}) {
  const { fontScale } = useWindowDimensions();
  const reduced = useReducedMotion();
  const base = useMemo(() => subtitleSpans(text), [text]);
  const enabled = !!onLookup && !!dictionary;
  const spans: LookupSpan[] = useMemo(() => enabled ? lookupSpans(text, masked, value => dictionary!.words(value)) : base, [text, masked, enabled, base]);
  const accessibleContainer = useRef<View>(null);
  const current = useRef<typeof spans | null>(spans);
  current.current = spans;
  useEffect(() => () => { current.current = null; }, []);
  const lookup = (span: LookupSpan) => {
    if (current.current === spans && span.term && onLookup) void onLookup(span.term, findNodeHandle(accessibleContainer.current));
  };
  const accessibleText = masked ? base.filter(span => span.hint).map(span => span.text).join(' … ') : text;
  const content = <Text accessible={!enabled} accessibilityElementsHidden={enabled}
    accessibilityLabel={enabled ? undefined : accessibleText} selectable={!masked && !enabled} allowFontScaling={false}
    style={{ color, fontSize: size * fontScale, ...textFontStyle(fontFamily, display, weight),
      lineHeight: size * fontScale * (display && !fontFamily ? 1.2 : 1.45), flexShrink: 1 }}>
    {spans.map((span, index) => <Animated.Text key={index} accessible={false}
      onPress={span.term ? () => lookup(span) : undefined} suppressHighlighting style={{
      color: masked && !span.hint ? background : color,
      transitionProperty: 'color', transitionDuration: reduced ? 0 : 180,
      transitionTimingFunction: REVEAL_EASING,
    }}>{span.text}</Animated.Text>)}
  </Text>;
  // Fabric's paragraph proxies omit custom actions. A native View owns the safe
  // VoiceOver label/actions; inline Text remains the ordinary touch surface.
  return enabled ? <View ref={accessibleContainer} accessible accessibilityLabel={accessibleText}
    accessibilityHint="동작 메뉴에서 단어의 사전을 열 수 있어요."
    accessibilityActions={spans.flatMap((span, index) => span.term ? [{ name: `lookup-${index}`, label: `${span.term} 사전 찾기` }] : [])}
    onAccessibilityAction={event => { const index = Number(event.nativeEvent.actionName.replace('lookup-', '')); if (spans[index]) lookup(spans[index]); }}>
    {content}
  </View> : content;
}
