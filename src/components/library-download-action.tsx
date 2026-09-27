import type { PropsWithChildren } from 'react';
import { Text, View, useWindowDimensions } from 'react-native';
import Animated, { FadeIn, FadeOut, ReduceMotion, useReducedMotion } from 'react-native-reanimated';
import type { DownloadPresentation } from '@/core/library-presentation';
import { FeedbackPressable } from './feedback-pressable';
import { Icon, usePalette } from './ui';

/** Keep status and cancellation readable within a half-width book card. */
export function LibraryDownloadAction({ download, onCancel, children }: PropsWithChildren<{
  download?: DownloadPresentation | null; onCancel?(): void;
}>) {
  const c = usePalette();
  const reduced = useReducedMotion();
  const { fontScale } = useWindowDimensions();
  const active = !!download;
  // The 32pt surface sits at the bottom of its 44pt touch target. Reclaim that
  // invisible 12pt above it so the visible gap matches the metadata's 6pt gap.
  return <View style={{ minHeight: 44, justifyContent: 'center', marginTop: active ? 0 : -12 }}>
    <Animated.View pointerEvents={active ? 'none' : 'auto'} accessibilityElementsHidden={active}
      importantForAccessibility={active ? 'no-hide-descendants' : 'auto'}
      style={{ opacity: active ? 0 : 1, ...(active ? { position: 'absolute', inset: 0 } as const : {}),
        transitionProperty: 'opacity', transitionDuration: reduced ? 0 : 200 }}>
      {children}
    </Animated.View>
    {download && <Animated.View entering={FadeIn.duration(200).reduceMotion(ReduceMotion.System)}
      exiting={FadeOut.duration(200).reduceMotion(ReduceMotion.System)}
      style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
      <View accessible accessibilityRole="progressbar" accessibilityLabel="레슨 다운로드 진행"
        accessibilityValue={{ min: 0, max: 100, now: Math.floor(download.progress * 100), text: download.label }}
        style={{ flex: 1, minWidth: 0, paddingHorizontal: 8, paddingVertical: 6, justifyContent: 'center', gap: 6,
          backgroundColor: c.blueSoft, borderRadius: 10, borderCurve: 'continuous' }}>
        <Text allowFontScaling={false}
          style={{ color: c.heading, fontWeight: '700', fontSize: 13 * fontScale, lineHeight: 13 * fontScale * 1.45 }}>
          {`${Math.floor(download.progress * 100)}%`}
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
        style={({ pressed }) => ({ minWidth: 44, minHeight: 44, flexShrink: 0, justifyContent: 'center', alignItems: 'center',
          opacity: pressed ? 0.65 : 1 })}>
          <View pointerEvents="none" style={{ width: 32, minHeight: 32, borderRadius: 10, borderCurve: 'continuous',
            backgroundColor: download.canCancel ? c.soft : c.disabled, justifyContent: 'center', alignItems: 'center' }}>
            <Icon name="xmark" size={16} color={download.canCancel ? c.red : c.secondary} />
          </View>
      </FeedbackPressable>
    </Animated.View>}
  </View>;
}
