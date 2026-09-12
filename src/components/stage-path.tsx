import { useCallback, useState } from 'react';
import { useFocusEffect } from 'expo-router';
import { View, useWindowDimensions } from 'react-native';
import { FeedbackPressable as Pressable } from './feedback-pressable';
import { canOpenStage, stageComplete, stageStars, type StageRecord } from '@/core/stage-overview';
import { Icon, Label, usePalette } from './ui';
import { MethodLabel, methodNames } from './method-label';
import { levelColors } from './level-colors';
import { StageStartPopover, type StageAnchor } from './stage-start-popover';

const offsets = [0.22, 0.5, 0.78, 0.5];
const coinSize = 76;
const coinRatio = 0.8;
const coinHeight = coinSize * coinRatio;

export function StagePath({ records, current, ready, onSelect }: {
  records: readonly StageRecord[]; current: number; ready: boolean; onSelect(stage: number): void;
}) {
  const c = usePalette();
  const [width, setWidth] = useState(0);
  const [selected, setSelected] = useState<StageAnchor | null>(null);
  useFocusEffect(useCallback(() => () => setSelected(null), []));
  const { fontScale } = useWindowDimensions();
  const rowHeight = Math.max(164, Math.ceil(94 + 70 * fontScale));
  return <View onLayout={e => { setWidth(e.nativeEvent.layout.width); setSelected(null); }}
    style={{ borderRadius: 28, borderWidth: 2, borderColor: c.line, overflow: 'hidden', paddingVertical: 30,
      backgroundColor: c.background }}>
    <View pointerEvents="none" accessible={false} style={{ position: 'absolute', inset: 0, opacity: 0.22,
      experimental_backgroundImage: `linear-gradient(to bottom, ${levelColors.mint} 0%, ${levelColors.macaw} 50%, ${levelColors.beetle} 100%)` }} />
    {selected && <Pressable feedback={false} accessible={false} onPress={() => setSelected(null)}
      style={{ position: 'absolute', inset: 0 }} />}
    {records.map((record, i) => {
      const available = canOpenStage(record.stage, records);
      const complete = stageComplete(record);
      const active = record.stage === current;
      const stars = stageStars(record);
      const x = width * offsets[i % 4]!;
      const nextX = width * offsets[(i + 1) % 4]!;
      const dx = nextX - x;
      const length = Math.hypot(dx, rowHeight);
      const label = !available ? record.stage <= 2 ? '이전 스테이지 완료 후 열림' : '준비 중' : record.session && record.session.phase !== 'complete' ? '이어하기' : complete ? '다시 학습' : '학습 시작';
      const fill = !available ? c.card : active ? c.accent : complete ? c.bee : c.card;
      const edge = !available ? c.outline : active ? c.accentPressed : complete ? c.fox : c.accentPressed;
      return <View key={record.stage} pointerEvents="box-none" style={{ height: rowHeight }}>
        {i < records.length - 1 && width > 0 && <View pointerEvents="none" style={{ position: 'absolute',
          left: (x + nextX) / 2 - length / 2, top: coinHeight / 2 + rowHeight / 2 - 4, width: length, height: 8,
          borderRadius: 4, backgroundColor: complete ? c.bee : c.line,
          transform: [{ rotate: `${Math.atan2(rowHeight, dx)}rad` }] }} />}
        <View pointerEvents="box-none" style={{ position: 'absolute', left: x - 70, width: 140, alignItems: 'center', gap: 10 }}>
          <Pressable accessibilityRole="button" accessibilityLabel={`Stage ${record.stage}, Lv ${Math.ceil(record.stage / 2)}, ${methodNames[Math.floor((record.stage - 1) / 2)]}, ${record.count}회 완료, ${label}`}
            accessibilityState={{ disabled: !available || !ready, selected: active }} disabled={!available || !ready}
            onPress={() => setSelected(previous => previous?.stage === record.stage ? null : { stage: record.stage,
              x, top: 30 + i * rowHeight, bottom: 30 + i * rowHeight + coinHeight, label, above: i === records.length - 1 })}
            style={({ pressed }) => ({ width: coinSize, height: coinHeight,
              alignItems: 'center', justifyContent: 'center', transform: [{ translateY: pressed ? 4 : 0 }] })}>
            {({ pressed }) => <>
            <View pointerEvents="none" accessible={false} style={{ position: 'absolute', width: coinSize, height: coinSize,
              top: (coinHeight - coinSize) / 2, borderRadius: coinSize / 2, borderWidth: 3, borderColor: edge, backgroundColor: fill,
              transform: [{ scaleY: coinRatio }], boxShadow: pressed ? `0 3px 0 ${edge}` : `0 7px 0 ${edge}` }}>
            <View style={{ position: 'absolute', inset: 3, borderRadius: 34, overflow: 'hidden' }}>
              <View style={{ position: 'absolute', width: 15, height: 80, left: 10, top: -24,
                transform: [{ rotate: '38deg' }], backgroundColor: '#ffffff', opacity: available ? 0.32 : 0.12 }} />
              <View style={{ position: 'absolute', width: 7, height: 80, left: 34, top: -18,
                transform: [{ rotate: '38deg' }], backgroundColor: '#ffffff', opacity: available ? 0.18 : 0.07 }} />
            </View>
            </View>
            <Icon name={!available ? 'lock.fill' : active ? 'play.fill' : complete ? 'checkmark' : 'speaker.wave.2.fill'}
              size={25} color={!available ? c.secondary : active || complete ? c.onAccent : c.heading} />
            <View style={{ position: 'absolute', right: -7, top: -7, minWidth: 26, minHeight: 26, paddingHorizontal: 5,
              borderRadius: 13, backgroundColor: '#042c60', alignItems: 'center', justifyContent: 'center' }}>
              <Label size={12} weight="800" color="#ffffff">{record.stage}</Label>
            </View>
            </>}
          </Pressable>
          <View accessible accessibilityRole="image"
            accessibilityLabel={`Stage ${record.stage}, 별 ${stars.filter(Boolean).length}/${stars.length}개 획득`}
            style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 5 }}>
            {stars.map((filled, index) => <Icon key={index} name={filled ? 'star.fill' : 'star'}
              size={19} color={filled ? c.accentPressed : c.secondary} />)}
          </View>
          <MethodLabel stage={record.stage} />
        </View>
      </View>;
    })}
    {selected && <StageStartPopover key={selected.stage} anchor={selected} width={width} onClose={() => setSelected(null)} onStart={onSelect} />}
  </View>;
}
