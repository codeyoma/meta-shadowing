import { useEffect } from 'react';
import { View, useWindowDimensions } from 'react-native';
import Animated, { useReducedMotion } from 'react-native-reanimated';
import { Label, usePalette } from './ui';
import type { ControlPressPoint } from './player-controls';

export type XpGainEvent = { id: number; amount: number; origin: ControlPressPoint };

/** Display-only receipt. Never creates or retries a reward. */
export function XpGain({ event, onFinish }: { event: XpGainEvent; onFinish(id: number): void }) {
  const c = usePalette(), reduced = useReducedMotion();
  const { fontScale } = useWindowDimensions();
  const width = 200 * fontScale;
  useEffect(() => {
    const timer = setTimeout(() => onFinish(event.id), 700);
    return () => clearTimeout(timer);
  }, [event.id, onFinish]);
  return <View pointerEvents="none" accessible accessibilityLabel={`${event.amount} XP 획득`}
    style={{ position: 'absolute', top: event.origin.y, left: event.origin.x - width / 2,
      width, zIndex: 2, transform: [{ translateY: '-50%' }] }}>
    <Animated.View style={{ alignItems: 'center',
      opacity: 0, animationDuration: 650, animationFillMode: 'forwards', animationTimingFunction: 'ease-out',
      animationName: reduced ? { from: { opacity: 1 }, '65%': { opacity: 1 }, to: { opacity: 0 } } : {
        from: { opacity: 0, transform: [{ translateY: 0 }, { scale: 0.92 }] },
        '18%': { opacity: 1, transform: [{ translateY: -18 }, { scale: 1 }] },
        '65%': { opacity: 1, transform: [{ translateY: -30 }, { scale: 1 }] },
        to: { opacity: 0, transform: [{ translateY: -40 }, { scale: 1 }] },
      } }}>
    <Label size={20} display color={c.heading}>+{event.amount} XP</Label>
    </Animated.View>
  </View>;
}
