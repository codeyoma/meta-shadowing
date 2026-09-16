import { useEffect, useRef } from 'react';
import { View, type GestureResponderEvent } from 'react-native';
import { FeedbackPressable as Pressable } from './feedback-pressable';
import Animated, { Easing, FadeInLeft, LinearTransition, ReduceMotion, useReducedMotion } from 'react-native-reanimated';
import { Icon, usePalette } from './ui';
import type { MainPlayerAction } from '@/core/player-presentation';

const CONTROL_LAYOUT = LinearTransition.duration(220).easing(Easing.bezier(0.23, 1, 0.32, 1)).reduceMotion(ReduceMotion.System);
const REPEAT_ENTER = FadeInLeft.duration(220).easing(Easing.bezier(0.23, 1, 0.32, 1))
  .withInitialValues({ opacity: 0, transform: [{ translateX: -88 }] }).reduceMotion(ReduceMotion.System);

const labels: Record<MainPlayerAction, string> = { resume: '이어하기', confirm: '말했어요, 다음 사이클',
  next: '다음 문장 또는 학습 마치기', leave: '학습 완료, 스테이지로 돌아가기', recover: '오류 복구 후 이어하기', wait: '음성 재생 중' };

export type ControlPressPoint = { x: number; y: number };

function Control({ action, repeat, disabled, onPress }: { action: MainPlayerAction; repeat?: boolean; disabled: boolean; onPress(event: GestureResponderEvent): void }) {
  const c = usePalette();
  const reduced = useReducedMotion();
  return <Pressable feedback={false} accessibilityRole="button" accessibilityLabel={repeat ? '두 번 더 연습' : labels[action]}
    accessibilityState={{ disabled }} disabled={disabled} onPress={onPress}>
    {({ pressed }) => <Animated.View layout={CONTROL_LAYOUT} style={{ minHeight: 54, padding: 12, alignItems: 'center', justifyContent: 'center',
      borderRadius: 16, backgroundColor: repeat ? c.card : c.accent, borderWidth: repeat ? 2 : 0, borderColor: c.line,
      boxShadow: `0 4px 0 ${repeat ? c.line : c.accentPressed}`, opacity: disabled ? 0.45 : 1,
      transform: [{ scale: pressed && !reduced ? 0.97 : 1 }], transitionProperty: 'transform', transitionDuration: reduced ? 0 : 120 }}>
      <Animated.View layout={CONTROL_LAYOUT}>
        <Icon name={repeat ? 'arrow.2.circlepath' : action === 'leave' ? 'checkmark' : 'play.fill'}
          size={26} color={repeat ? c.heading : c.onAccent} />
      </Animated.View>
    </Animated.View>}
  </Pressable>;
}

export function PlayerControls({ action, repeat, busy, onMain, onRepeat }: {
  action: MainPlayerAction; repeat: boolean; busy: boolean; onMain(point: ControlPressPoint): void; onRepeat(point: ControlPressPoint): void;
}) {
  const row = useRef<View>(null);
  const mounted = useRef(true);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  function press(event: GestureResponderEvent, extra: boolean) {
    // Page coordinates stay correct even when the icon is the touch target or
    // the repeat button is animating. Copy before the native measurement callback.
    const { pageX, pageY } = event.nativeEvent;
    row.current?.measureInWindow((x, y, width, height) => {
      if (!mounted.current) return;
      const touch = Number.isFinite(pageX) && Number.isFinite(pageY) && (pageX !== 0 || pageY !== 0);
      const point = touch ? { x: pageX - x, y: pageY - y }
        : { x: repeat ? extra ? (width - 12) / 8 : (width - 12) * 5 / 8 + 12 : width / 2, y: height / 2 };
      (extra ? onRepeat : onMain)(point);
    });
  }
  return <View ref={row} collapsable={false} style={{ flexDirection: 'row', gap: 12 }}>
    {repeat && <Animated.View key="repeat" entering={REPEAT_ENTER} style={{ flex: 1 }}>
      <Control action={action} repeat disabled={busy || action !== 'next'} onPress={event => press(event, true)} />
    </Animated.View>}
    <Animated.View key="main" layout={CONTROL_LAYOUT} style={{ flex: repeat ? 3 : 1 }}>
      <Control action={action} disabled={busy || action === 'wait'} onPress={event => press(event, false)} />
    </Animated.View>
  </View>;
}
