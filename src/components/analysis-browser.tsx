import { useState } from 'react';
import { ScrollView, View } from 'react-native';
import { FeedbackPressable as Pressable } from './feedback-pressable';
import { Stack } from 'expo-router';
import { Icon, Label, usePalette } from './ui';
import { partOfSpeechName, type AnalysisSentence } from '@/core/sentence-analysis';

export function AnalysisBrowser({ sentences, onClose }: {
  sentences: readonly AnalysisSentence[]; onClose(): void;
}) {
  const c = usePalette();
  const [selected, setSelected] = useState<string | null>(null);
  const sentence = sentences.find(s => s.id === selected);
  return <>
    <ScrollView key={sentence?.id ?? 'list'} contentInsetAdjustmentBehavior="automatic"
      contentContainerStyle={{ padding: 16, gap: 16 }}>
      {sentence ? <>
        <Label size={24}>{sentence.text}</Label>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 12 }}>
          {sentence.tokens.map((token, index) => <View key={index} accessible
            accessibilityLabel={`${token.text}, ${partOfSpeechName(token.pos)}`}
            style={{ backgroundColor: c.card, borderRadius: 16, borderCurve: 'continuous', padding: 16, gap: 4 }}>
            <Label size={21}>{token.text}</Label><Label size={14} muted>{partOfSpeechName(token.pos)}</Label>
          </View>)}
        </View>
      </> : <>
        <Label muted>분석할 문장을 선택하세요.</Label>
        {sentences.map((item, index) => <Pressable key={item.id} accessibilityRole="button"
          accessibilityLabel={`문장 ${index + 1} 분석: ${item.text}`} onPress={() => setSelected(item.id)}
          style={({ pressed }) => ({ backgroundColor: pressed ? c.soft : c.card, borderRadius: 24,
            borderCurve: 'continuous', padding: 20, minHeight: 52, flexDirection: 'row', gap: 12, alignItems: 'center' })}>
          <View style={{ flex: 1, gap: 6 }}><Label size={13} muted>{`문장 ${index + 1}`}</Label>
            <Label>{item.text}</Label></View><Icon name="chevron.right" size={16} />
        </Pressable>)}
      </>}
    </ScrollView>
    <Stack.Screen options={{ title: sentence ? '문장 분석' : '문장 목록', sheetAllowedDetents: [1], sheetCornerRadius: 32 }} />
    <Stack.Toolbar placement="left"><Stack.Toolbar.Button icon="chevron.left" hidden={!sentence}
      accessibilityLabel="문장 목록으로 돌아가기" onPress={() => setSelected(null)} /></Stack.Toolbar>
    <Stack.Toolbar placement="right"><Stack.Toolbar.Button icon="xmark"
      accessibilityLabel="분석 닫기" onPress={onClose} /></Stack.Toolbar>
  </>;
}
