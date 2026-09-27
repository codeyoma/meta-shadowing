import { useEffect, useState, type ReactNode } from 'react';
import { AppState, ScrollView, Text, View, useWindowDimensions } from 'react-native';
import { FeedbackPressable as Pressable } from './feedback-pressable';
import { Label, usePalette } from './ui';
import { partOfSpeechName, type AnalysisSentence } from '@/core/sentence-analysis';
import { englishRelationName, relationsForToken } from '@/core/sentence-relations';
import { DependencyArcs } from './dependency-arcs';
import { AnalysisDictionaryButton } from './analysis-dictionary-button';
import { useSettingsColors } from './settings-row';
import { SentenceCopyButton } from './sentence-copy-button';

/** Only reference UI state lives here; no player, checkpoint or reward capabilities. */
export function SentenceRelationGraph({ sentence, active = true }: { sentence: AnalysisSentence; active?: boolean }) {
  const c = usePalette(), settings = useSettingsColors(), { fontScale } = useWindowDimensions();
  const [selection, setSelection] = useState<number | null>(null);
  const selected = active ? selection : null;
  useEffect(() => { if (!active) setSelection(null); }, [active]);
  useEffect(() => {
    const subscription = AppState.addEventListener('change', state => {
      if (state !== 'active') setSelection(null);
    });
    return () => subscription.remove();
  }, []);
  const [boxes, setBoxes] = useState<Record<number, { x: number; width: number }>>({});
  const relations = relationsForToken(sentence, selected);
  const allRelations = relationsForToken(sentence, null);
  return <View style={{ gap: 16 }}>
    <View testID="analysis.sentence-card" style={{ flexDirection: 'row', alignItems: 'center', gap: 8,
      padding: 16, borderRadius: 16, borderCurve: 'continuous', backgroundColor: settings.group }}>
      <View style={{ flex: 1 }}><Label size={24}>{sentence.text}</Label></View>
      <SentenceCopyButton text={sentence.text} active={active} />
    </View>
    <View testID="analysis.graph-card" style={{ padding: 16, borderRadius: 16, borderCurve: 'continuous',
      backgroundColor: settings.group, gap: 8, marginBottom: 16 }}>
    <Label size={14} muted>화살표는 역할을 하는 단어에서 연결된 중심어를 향해요.</Label>
    <GraphScroll fontScale={fontScale}>
      <View style={{ direction: 'ltr' }}>
        <DependencyArcs edges={allRelations.edges} boxes={boxes} selected={selected} scale={fontScale} />
        <View style={{ flexDirection: 'row', gap: 8, alignItems: 'stretch' }}>
          {sentence.tokens.map((token, index) => {
            const active = selected === index, connected = relations.connected.includes(index);
            return <Pressable key={index} accessibilityRole="button"
              accessibilityLabel={`단어 ${index + 1}: ${token.text}, ${partOfSpeechName(token.pos)}`}
              accessibilityHint={connected && !active ? '선택한 단어와 직접 연결됨. 이 단어의 관계 보기' : '이 단어의 관계 보기'}
              accessibilityState={{ selected: active }} onPress={() => setSelection(active ? null : index)}
              onLayout={({ nativeEvent: { layout: { x, width } } }) => setBoxes(previous => {
                return previous[index]?.x === x && previous[index]?.width === width ? previous
                  : { ...previous, [index]: { x, width } };
              })}
              style={({ pressed }) => ({ minWidth: 44, minHeight: 64, paddingHorizontal: 4, paddingVertical: 8,
                gap: 4, flexShrink: 0, alignItems: 'center', opacity: pressed ? 0.65 : 1 })}>
              <Text allowFontScaling={false} style={{ fontSize: 21 * fontScale, lineHeight: 30 * fontScale,
                fontWeight: '500', color: active ? c.accent : connected ? c.link : c.text,
                textDecorationLine: active ? 'underline' : 'none' }}>{token.text}</Text>
              <Text allowFontScaling={false} style={{ fontSize: 12 * fontScale, lineHeight: 18 * fontScale,
                color: c.secondary }}>{partOfSpeechName(token.pos)}</Text>
              <Text allowFontScaling={false} style={{ fontSize: 12 * fontScale, lineHeight: 18 * fontScale,
                color: c.secondary }}>{partOfSpeechName(token.pos, 'en')}</Text>
            </Pressable>;
          })}
        </View>
      </View>
    </GraphScroll>
    </View>
    {selected === null ? <Label muted>단어를 선택하면 연결 관계를 볼 수 있어요.</Label> : <View style={{ gap: 12 }}>
      <View testID="analysis.dictionary-spacing" style={{ paddingBottom: 20 }}>
        <AnalysisDictionaryButton key={selected} term={sentence.tokens[selected]!.text} />
      </View>
      {relations.root && <Label>문장의 중심어 (root)입니다.</Label>}
      {!relations.root && relations.edges.length === 0 && <Label muted>표시할 직접 연결 관계가 없어요.</Label>}
      {relations.edges.map(edge => {
        const title = `${sentence.tokens[edge.dependent]!.text} → ${sentence.tokens[edge.head]!.text}: ${edge.name} (${englishRelationName(edge.label)})`;
        return <View key={edge.dependent} accessible accessibilityLabel={title} accessibilityHint={edge.explanation}
          style={{ padding: 16, borderRadius: 16, borderCurve: 'continuous', backgroundColor: c.card, gap: 8 }}>
          <Label weight="700">{title}</Label><Label muted>{edge.explanation}</Label>
        </View>;
      })}
    </View>}
  </View>;
}

/** Keep scroll updates local so moving the indicator does not rerender the graph. */
function GraphScroll({ children, fontScale }: { children: ReactNode; fontScale: number }) {
  const c = usePalette();
  const [viewport, setViewport] = useState(0), [content, setContent] = useState(0), [offset, setOffset] = useState(0);
  const overflow = viewport > 0 && content > viewport;
  const thumbWidth = overflow ? Math.min(viewport, Math.max(24, viewport * viewport / content)) : 0;
  const position = overflow ? Math.min(1, Math.max(0, offset / (content - viewport))) * (viewport - thumbWidth) : 0;
  return <View style={{ gap: 4 }}>
    <ScrollView horizontal accessibilityLabel="문장 관계 그래프" contentInsetAdjustmentBehavior="automatic"
      showsHorizontalScrollIndicator={false} scrollEventThrottle={16}
      onLayout={event => setViewport(event.nativeEvent.layout.width)}
      onContentSizeChange={width => setContent(width)}
      onScroll={event => setOffset(event.nativeEvent.contentOffset.x)}
      contentContainerStyle={{ paddingVertical: 8, paddingRight: 48 * fontScale }}>
      {children}
    </ScrollView>
    {overflow && <View pointerEvents="none" accessible={false} accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants" style={{ height: 4, borderRadius: 2, backgroundColor: c.line }}>
      <View testID="sentence-graph-scroll-thumb" style={{ width: thumbWidth, height: 4, borderRadius: 2,
        backgroundColor: c.secondary, transform: [{ translateX: position }] }} />
    </View>}
  </View>;
}
