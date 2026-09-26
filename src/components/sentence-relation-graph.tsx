import { useState } from 'react';
import { ScrollView, View, useWindowDimensions } from 'react-native';
import { FeedbackPressable as Pressable } from './feedback-pressable';
import { Label, usePalette } from './ui';
import { partOfSpeechName, type AnalysisSentence } from '@/core/sentence-analysis';
import { relationsForToken } from '@/core/sentence-relations';

/** Only reference UI state lives here; no player, checkpoint or reward capabilities. */
export function SentenceRelationGraph({ sentence }: { sentence: AnalysisSentence }) {
  const c = usePalette(), { fontScale } = useWindowDimensions();
  const [selected, setSelected] = useState<number | null>(null);
  const [centers, setCenters] = useState<Record<number, number>>({});
  const relations = relationsForToken(sentence, selected);
  const height = relations.edges.length * 48 * fontScale + 24;
  return <View style={{ gap: 16 }}>
    <Label size={24}>{sentence.text}</Label>
    <Label size={14} muted>좌우로 밀어 모든 단어를 볼 수 있어요.</Label>
    <ScrollView horizontal accessibilityLabel="문장 관계 그래프" contentInsetAdjustmentBehavior="automatic"
      contentContainerStyle={{ paddingVertical: 8 }}>
      <View style={{ direction: 'ltr' }}>
        <View style={{ height }} pointerEvents="none" accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
          {relations.edges.map((edge, lane) => {
            const head = centers[edge.head], dependent = centers[edge.dependent];
            if (head === undefined || dependent === undefined) return null;
            const left = Math.min(head, dependent), width = Math.abs(head - dependent);
            const top = (relations.edges.length - lane - 1) * 48 * fontScale + 24;
            return <View key={edge.dependent} style={{ position: 'absolute', left, width, top, bottom: 4 }}>
              <View style={{ position: 'absolute', inset: 0, borderTopWidth: 2, borderLeftWidth: 2,
                borderRightWidth: 2, borderColor: c.link, borderTopLeftRadius: 12, borderTopRightRadius: 12 }} />
              <View style={{ position: 'absolute', top: -22 * fontScale, left: 0, right: 0, alignItems: 'center' }}>
                <View style={{ backgroundColor: c.background, paddingHorizontal: 4 }}>
                  <Label size={13} color={c.link}>{edge.name}</Label>
                </View>
              </View>
              <View style={{ position: 'absolute', left: dependent - left - 5, bottom: 0,
                width: 10, height: 10, borderBottomWidth: 2, borderRightWidth: 2, borderColor: c.link,
                transform: [{ rotate: '45deg' }] }} />
            </View>;
          })}
        </View>
        <View style={{ flexDirection: 'row', gap: 12, alignItems: 'stretch' }}>
          {sentence.tokens.map((token, index) => {
            const active = selected === index, connected = relations.connected.includes(index);
            return <Pressable key={index} accessibilityRole="button"
              accessibilityLabel={`단어 ${index + 1}: ${token.text}, ${partOfSpeechName(token.pos)}`}
              accessibilityHint={connected && !active ? '선택한 단어와 직접 연결됨. 이 단어의 관계 보기' : '이 단어의 관계 보기'}
              accessibilityState={{ selected: active }} onPress={() => setSelected(index)}
              onLayout={({ nativeEvent: { layout } }) => setCenters(previous => {
                const center = layout.x + layout.width / 2;
                return previous[index] === center ? previous : { ...previous, [index]: center };
              })}
              style={({ pressed }) => ({ minWidth: 150 * fontScale, minHeight: 88, padding: 14, gap: 4,
                flexShrink: 0, borderRadius: 16, borderCurve: 'continuous', borderWidth: 2,
                borderColor: active ? c.link : connected ? c.outline : c.line,
                backgroundColor: active || pressed ? c.soft : c.card })}>
              <Label size={12} color={active ? c.link : c.secondary}>{active ? '✓ 선택됨' : connected ? '연결됨' : `단어 ${index + 1}`}</Label>
              <Label size={21} weight={active ? '800' : '500'}>{token.text}</Label>
              <Label size={14} muted>{partOfSpeechName(token.pos)}</Label>
            </Pressable>;
          })}
        </View>
      </View>
    </ScrollView>
    {selected === null ? <Label muted>단어를 선택하면 연결 관계를 볼 수 있어요.</Label> : <View style={{ gap: 12 }}>
      <Label weight="700">{`${sentence.tokens[selected]!.text} · 연결 관계`}</Label>
      <Label size={14} muted>화살표는 중심어에서 의존어를 향해요.</Label>
      {relations.root && <Label>문장의 중심어 (ROOT)입니다. 자기 자신을 향한 화살표는 표시하지 않아요.</Label>}
      {!relations.root && relations.edges.length === 0 && <Label muted>표시할 직접 연결 관계가 없어요.</Label>}
      {relations.edges.map(edge => {
        const title = `${sentence.tokens[edge.head]!.text} → ${sentence.tokens[edge.dependent]!.text}: ${edge.name} (${edge.label})`;
        return <View key={edge.dependent} accessible accessibilityLabel={title} accessibilityHint={edge.explanation}
          style={{ padding: 16, borderRadius: 16, borderCurve: 'continuous', backgroundColor: c.card, gap: 8 }}>
          <Label weight="700">{title}</Label><Label muted>{edge.explanation}</Label>
        </View>;
      })}
    </View>}
  </View>;
}
