import type { PropsWithChildren } from 'react';
import { Text, View, useWindowDimensions } from 'react-native';
import Animated, { FadeIn, FadeOut, ReduceMotion, useReducedMotion } from 'react-native-reanimated';
import type { DownloadPresentation } from '@/core/library-presentation';
import { FeedbackPressable } from './feedback-pressable';
import { Icon, usePalette } from './ui';

/** Crossfade in the existing action slot; progress never adds another card row. */
export function LibraryDownloadAction({ download, onCancel, children }: PropsWithChildren<{
  download?: DownloadPresentation | null; onCancel?(): void;
}>) {
  const c = usePalette();
  const reduced = useReducedMotion();
  const { fontScale } = useWindowDimensions();
  const active = !!download;
  return <View style={{ minHeight: Math.max(54, 13 * fontScale * 1.45 + 26), justifyContent: 'center' }}>
    <Animated.View pointerEvents={active ? 'none' : 'auto'} accessibilityElementsHidden={active}
      importantForAccessibility={active ? 'no-hide-descendants' : 'auto'}
      style={{ opacity: active ? 0 : 1, transitionProperty: 'opacity', transitionDuration: reduced ? 0 : 200 }}>
      {children}
    </Animated.View>
    {download && <Animated.View entering={FadeIn.duration(200).reduceMotion(ReduceMotion.System)}
      exiting={FadeOut.duration(200).reduceMotion(ReduceMotion.System)}
      style={{ position: 'absolute', inset: 0, flexDirection: 'row', gap: 8 }}>
      <View accessible accessibilityRole="progressbar" accessibilityLabel="레슨 다운로드 진행"
        accessibilityValue={{ min: 0, max: 100, now: Math.floor(download.progress * 100), text: download.label }}
        style={{ flex: 1, minWidth: 0, paddingHorizontal: 12, paddingVertical: 8, justifyContent: 'center', gap: 6,
          backgroundColor: c.blueSoft, borderRadius: 14, borderCurve: 'continuous' }}>
        <Text numberOfLines={1} allowFontScaling={false}
          style={{ color: c.heading, fontWeight: '700', fontSize: 13 * fontScale, lineHeight: 13 * fontScale * 1.45 }}>
          {download.label}
        </Text>
        <View style={{ height: 5, borderRadius: 3, backgroundColor: c.line, overflow: 'hidden' }}>
          <Animated.View style={{ position: 'absolute', left: 0, top: 0, bottom: 0, borderRadius: 3,
            width: `${download.progress * 100}%`, backgroundColor: c.blue,
            transitionProperty: 'width', transitionDuration: reduced ? 0 : 200, transitionTimingFunction: 'linear' }} />
        </View>
      </View>
      <FeedbackPressable accessibilityRole="button" accessibilityLabel="다운로드 취소"
        accessibilityState={{ disabled: !download.canCancel || !onCancel }}
        disabled={!download.canCancel || !onCancel} onPress={onCancel}
        style={({ pressed }) => ({ width: '20%', minWidth: 44, minHeight: 54, borderRadius: 14,
          backgroundColor: download.canCancel ? c.soft : c.disabled, justifyContent: 'center', alignItems: 'center',
          opacity: pressed ? 0.65 : 1 })}>
          <Icon name="xmark" size={20} color={download.canCancel ? c.red : c.secondary} />
      </FeedbackPressable>
    </Animated.View>}
  </View>;
}
