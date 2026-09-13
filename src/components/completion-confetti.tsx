import { useEffect } from 'react';
import { View, useWindowDimensions } from 'react-native';
import Animated, { useReducedMotion } from 'react-native-reanimated';

const colors = ['#ffc800', '#1cb0f6', '#58cc02', '#ce82ff', '#ff4b4b'];
const pieces = Array.from({ length: 28 }, (_, index) => index);

/** Decorative and non-interactive; mount only for a newly saved completion. */
export function CompletionConfetti({ onFinish }: { onFinish(): void }) {
  const { width, height } = useWindowDimensions();
  const reduced = useReducedMotion();
  useEffect(() => {
    const timer = setTimeout(onFinish, reduced ? 700 : 1800);
    return () => clearTimeout(timer);
  }, [onFinish, reduced]);
  return <View pointerEvents="none" accessible={false} accessibilityElementsHidden
    importantForAccessibility="no-hide-descendants" style={{ position: 'absolute', inset: 0, overflow: 'hidden', zIndex: 50 }}>
    {pieces.map(index => <Animated.View key={index} style={{ position: 'absolute',
      left: (index + 0.5) / pieces.length * width, top: reduced ? height * 0.2 + index % 4 * 28 : -24,
      width: index % 3 === 0 ? 7 : 10, height: index % 3 === 0 ? 7 : 16,
      borderRadius: index % 3 === 0 ? 4 : 2, backgroundColor: colors[index % colors.length], opacity: 0,
      animationName: reduced ? { from: { opacity: 0 }, '25%': { opacity: 0.85 }, '70%': { opacity: 0.85 }, to: { opacity: 0 } }
        : { from: { opacity: 0, transform: [{ translateY: 0 }, { translateX: 0 }, { rotate: '0deg' }] },
          '10%': { opacity: 1 }, '75%': { opacity: 1 },
          to: { opacity: 0, transform: [{ translateY: height }, { translateX: index % 2 ? 38 : -38 }, { rotate: index % 2 ? '320deg' : '-320deg' }] } },
      animationDuration: reduced ? 500 : 1450, animationDelay: reduced ? 0 : index % 5 * 40,
      animationTimingFunction: 'linear', animationFillMode: 'both', animationIterationCount: 1,
    }} />)}
  </View>;
}
