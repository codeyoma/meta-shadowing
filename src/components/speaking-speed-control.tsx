import { useEffect, useRef, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import Slider from '@react-native-community/slider';
import Animated, { Easing, FadeIn, FadeOut, LinearTransition, useReducedMotion } from 'react-native-reanimated';
import { changeSpeakingSpeed, normalizeSpeakingSpeeds, speakingSpeedRange } from '@/core/speaking-speed';
import type { Settings } from '@/core/settings';
import { Icon, Label } from './ui';
import { useSettingsColors } from './settings-row';

type Speeds = NonNullable<Settings['crazyWpm']>;
export function SpeakingSpeedControl({ speeds, onChange }: { speeds?: Speeds; onChange: (speeds: Speeds) => void }) {
  const c = useSettingsColors();
  const reduced = useReducedMotion();
  const transition = LinearTransition.duration(reduced ? 0 : 180).easing(Easing.bezier(0.23, 1, 0.32, 1));
  const [expanded, setExpanded] = useState<number | null>(null);
  const [draft, setDraft] = useState(() => normalizeSpeakingSpeeds(speeds));
  const sliding = useRef(false);
  useEffect(() => { setDraft(normalizeSpeakingSpeeds(speeds)); }, [speeds]);
  function commit(index: number, value: number) {
    const next = changeSpeakingSpeed(normalizeSpeakingSpeeds(speeds), index, value);
    setDraft(next); onChange(next);
  }
  return <Animated.View layout={transition}>
    {draft.map((value, index) => {
      const range = speakingSpeedRange(draft, index), open = expanded === index;
      const choices = Array.from({ length: index === 0 ? 5 : 3 }, (_, i) => range.min + i * range.step);
      return <Animated.View key={index} layout={transition} style={{ overflow: 'hidden' }}>
        {index > 0 && <View style={{ height: StyleSheet.hairlineWidth, backgroundColor: c.separator }} />}
        <Pressable accessibilityRole="button" accessibilityLabel={`${index + 1}단계 ${value} WPM 수정`}
          accessibilityState={{ expanded: open }} onPress={() => { setExpanded(open ? null : index); }}
          style={({ pressed }) => ({ minHeight: 54, paddingVertical: 12, paddingHorizontal: 4, gap: 12,
            flexDirection: 'row', alignItems: 'center', backgroundColor: pressed ? c.pressed : c.group })}>
          <View style={{ flex: 1 }}><Label size={17} color={c.text}>{index + 1}단계</Label></View>
          <Label size={17} color={c.secondary}>{value} WPM</Label>
          <Animated.View accessibilityElementsHidden style={{ transform: [{ rotate: open ? '90deg' : '0deg' }],
            transitionProperty: 'transform', transitionDuration: reduced ? 0 : 180, transitionTimingFunction: 'ease-out' }}>
            <Icon name="chevron.right" size={18} color={c.secondary} />
          </Animated.View>
        </Pressable>
        {open && <Animated.View key={`slider-${index}`} entering={FadeIn.duration(reduced ? 0 : 180)}
          exiting={FadeOut.duration(reduced ? 0 : 120)} style={{ paddingBottom: 16, gap: 6 }}>
          <Slider accessibilityLabel={`${index + 1}단계 스피킹 속도`} accessibilityRole="adjustable"
            accessibilityValue={{ min: range.min, max: range.max, now: value, text: `${value} WPM` }}
            accessibilityActions={[{ name: 'increment' }, { name: 'decrement' }]}
            onAccessibilityAction={({ nativeEvent }) => {
              if (nativeEvent.actionName === 'increment') commit(index, value + range.step);
              if (nativeEvent.actionName === 'decrement') commit(index, value - range.step);
            }}
            value={value} minimumValue={range.min} maximumValue={range.max} step={range.step} tapToSeek
            onSlidingStart={() => { sliding.current = true; }}
            onValueChange={next => {
              setDraft(changeSpeakingSpeed(normalizeSpeakingSpeeds(speeds), index, next));
              if (!sliding.current) commit(index, next);
            }}
            onSlidingComplete={next => { sliding.current = false; commit(index, next); }}
            minimumTrackTintColor="#007aff" maximumTrackTintColor={c.separator} style={{ height: 44 }} />
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginHorizontal: 10 }}>
            {choices.map((choice, i) => <Label key={choice} size={13} color={c.secondary}>{index === 0 ? choice : `+${50 + i * 50}`}</Label>)}
          </View>
          <Label size={13} color={c.secondary}>{index === 0 ? '25 WPM 단위로 조절해요.' : '이전 단계와의 간격을 선택해요.'} 이후 단계도 같은 간격을 유지해요.</Label>
        </Animated.View>}
      </Animated.View>;
    })}
  </Animated.View>;
}
