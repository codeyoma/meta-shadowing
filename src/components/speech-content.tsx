import { useEffect, useRef } from 'react';
import { ScrollView, View, useWindowDimensions } from 'react-native';
import { Label, usePalette } from './ui';
import { speechBubbles } from '@/core/speech-bubbles';

/** Display-only: list rows cannot seek, confirm, or otherwise change the learning session. */
export function SpeechContent({ phrases, active, view }: {
  phrases: readonly { text: string; translation: string }[]; active: number; view: 'bubble' | 'list';
}) {
  const c = usePalette(), { height } = useWindowDimensions();
  const list = useRef<ScrollView>(null), positions = useRef(new Map<number, number>());
  useEffect(() => { list.current?.scrollTo({ y: positions.current.get(active) ?? 0, animated: false }); }, [active, view]);
  const phrase = phrases[active];
  if (view === 'bubble') return <View style={{ gap: 16 }}>
    {phrase && speechBubbles(phrase).map((pair, index) => <View key={index} style={{
      alignSelf: index % 2 === 0 ? 'flex-start' : 'flex-end', maxWidth: '94%', gap: 12,
      backgroundColor: index % 2 === 0 ? c.card : c.blueSoft, borderRadius: 24,
      borderBottomLeftRadius: index % 2 === 0 ? 6 : 24, borderBottomRightRadius: index % 2 === 0 ? 24 : 6,
      padding: 20, borderWidth: 1, borderColor: index % 2 === 0 ? c.line : c.blueSoft,
    }}>
      <Label size={29} display color={c.heading}>{pair.text}</Label>
      <Label size={18} color={c.heading}>{pair.translation}</Label>
    </View>)}
  </View>;
  return <ScrollView ref={list} nestedScrollEnabled style={{ maxHeight: Math.max(160, Math.min(360, height * 0.4)) }}
    contentContainerStyle={{ gap: 8, paddingBottom: 60 }}>
    {phrases.map((item, index) => <View key={index} onLayout={event => {
      const y = event.nativeEvent.layout.y;
      positions.current.set(index, y);
      if (index === active) list.current?.scrollTo({ y, animated: false });
    }} style={{ padding: 16, gap: 8, borderRadius: 14, backgroundColor: index === active ? c.blueSoft : c.card,
      borderLeftWidth: 3, borderLeftColor: index === active ? c.blue : 'transparent' }}>
      <Label size={13} muted>{index + 1}{index === active ? ' · 현재 문장' : ''}</Label>
      <Label size={index === active ? 24 : 19} weight={index === active ? '700' : '400'} color={c.heading}>{item.text}</Label>
      <Label size={16} muted>{item.translation}</Label>
    </View>)}
  </ScrollView>;
}
