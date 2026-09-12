import { useEffect, useRef, useState } from 'react';
import { ScrollView, View } from 'react-native';
import Animated, { Easing, useAnimatedStyle, useReducedMotion, useSharedValue, withDelay, withTiming, type SharedValue } from 'react-native-reanimated';
import type { Session } from '@/core/session';
import { completedConnections, cycleTimeline } from '@/core/player-presentation';
import { Icon, usePalette } from './ui';

const SIZE = 48;
const EASE_OUT = Easing.bezier(0.23, 1, 0.32, 1);

// Two clipped semicircles draw a continuous ring without an additional native dependency.
function HalfRing({ progress, second, color }: { progress: SharedValue<number>; second: boolean; color: string }) {
  const rotation = useAnimatedStyle(() => ({ transform: [{ rotate: `${Math.max(0, Math.min(180, (progress.get() - (second ? 0.5 : 0)) * 360))}deg` }] }));
  return <View pointerEvents="none" style={{ position: 'absolute', left: second ? 0 : SIZE / 2, top: 0,
    width: SIZE / 2, height: SIZE, overflow: 'hidden' }}>
    <Animated.View style={[{ position: 'absolute', left: second ? 0 : -SIZE / 2, width: SIZE, height: SIZE }, rotation]}>
      <View style={{ position: 'absolute', left: second ? SIZE / 2 : 0, width: SIZE / 2, height: SIZE, overflow: 'hidden' }}>
        <View style={{ position: 'absolute', left: second ? -SIZE / 2 : 0, width: SIZE, height: SIZE,
          borderRadius: SIZE / 2, borderWidth: 3, borderColor: color }} />
      </View>
    </Animated.View>
  </View>;
}

function CycleNode({ index, x, complete, active, progress, playing, added }: {
  index: number; x: number; complete: boolean; active: boolean; progress: number; playing: boolean; added: boolean;
}) {
  const c = usePalette();
  const reduced = useReducedMotion();
  const position = useSharedValue(x + (added && !reduced ? 24 : 0));
  const opacity = useSharedValue(added ? 0 : 1);
  const ring = useSharedValue(progress);
  const checkScale = useSharedValue(1);
  const wasComplete = useRef(complete);
  useEffect(() => {
    position.set(reduced ? x : withTiming(x, { duration: 180, easing: EASE_OUT }));
    opacity.set(withTiming(1, { duration: reduced ? 0 : 160 }));
  }, [x, reduced, position, opacity]);
  useEffect(() => {
    ring.set(playing && !reduced ? withTiming(progress, { duration: 100, easing: Easing.linear }) : progress);
  }, [progress, playing, reduced, ring]);
  useEffect(() => {
    if (complete && !wasComplete.current && !reduced) {
      checkScale.set(0.92);
      checkScale.set(withTiming(1, { duration: 120, easing: EASE_OUT }));
    }
    wasComplete.current = complete;
  }, [complete, reduced, checkScale]);
  const placement = useAnimatedStyle(() => ({ opacity: opacity.get(), transform: [{ translateX: position.get() }] }));
  const check = useAnimatedStyle(() => ({ transform: [{ scale: checkScale.get() }] }));
  return <Animated.View accessible accessibilityLabel={`${index + 1}회 ${complete ? '완료' : active ? '현재 사이클' : '대기'}`}
    accessibilityValue={active ? { min: 0, max: 100, now: Math.round(progress * 100) } : undefined}
    style={[{ position: 'absolute', width: SIZE, height: SIZE }, placement]}>
    <View style={{ position: 'absolute', inset: 2, borderRadius: SIZE / 2, borderWidth: 2,
      borderColor: complete ? c.accentPressed : c.outline, backgroundColor: complete ? c.accent : c.card,
      alignItems: 'center', justifyContent: 'center' }}>
      {complete && <Animated.View style={check}><Icon name="checkmark" color={c.onAccent} size={21} /></Animated.View>}
    </View>
    {active && <><HalfRing progress={ring} second={false} color={c.accentPressed} /><HalfRing progress={ring} second color={c.accentPressed} /></>}
  </Animated.View>;
}

export function CycleTimeline({ state, duration }: { state: Session; duration: number }) {
  const c = usePalette();
  const [width, setWidth] = useState(0);
  const initialCount = useRef(state.planned);
  const scroll = useRef<ScrollView>(null);
  const previousCount = useRef(state.planned);
  const reduced = useReducedMotion();
  const model = cycleTimeline(state, duration);
  const contentWidth = Math.max(width, model.count * 56);
  const connectionCount = completedConnections(state);
  const targetWidth = (contentWidth - SIZE) * connectionCount / (model.count - 1);
  const lineWidth = useSharedValue(targetWidth);
  const previousConnections = useRef(connectionCount);
  useEffect(() => {
    const newlyConfirmed = connectionCount > previousConnections.current;
    const movement = withTiming(targetWidth, { duration: 140, easing: Easing.linear });
    lineWidth.set(reduced ? targetWidth : newlyConfirmed ? withDelay(120, movement) : movement);
    previousConnections.current = connectionCount;
  }, [connectionCount, targetWidth, reduced, lineWidth]);
  const line = useAnimatedStyle(() => ({ width: lineWidth.get() }));
  useEffect(() => {
    if (model.count > previousCount.current && contentWidth > width) scroll.current?.scrollToEnd({ animated: !reduced });
    previousCount.current = model.count;
  }, [model.count, contentWidth, width, reduced]);
  return <View onLayout={event => setWidth(event.nativeEvent.layout.width)} style={{ width: '100%', minHeight: SIZE, marginVertical: 8 }}>
    <ScrollView ref={scroll} horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ width: contentWidth, height: SIZE }}>
      <View pointerEvents="none" style={{ position: 'absolute', left: SIZE / 2, right: SIZE / 2, top: SIZE / 2 - 2, height: 4, backgroundColor: c.line }} />
      <Animated.View pointerEvents="none" style={[{ position: 'absolute', left: SIZE / 2, top: SIZE / 2 - 2,
        height: 4, backgroundColor: c.accentPressed }, line]} />
      {Array.from({ length: model.count }, (_, index) => <CycleNode key={index} index={index}
        x={(contentWidth - SIZE) * index / (model.count - 1)} complete={index < model.confirmed}
        active={index === model.active} progress={index === model.active ? model.progress : 0}
        playing={state.running && state.phase === 'listening'} added={index >= initialCount.current} />)}
    </ScrollView>
  </View>;
}
