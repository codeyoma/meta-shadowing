import { useMemo } from 'react';
import { Text, View, useWindowDimensions } from 'react-native';
import type { Session } from '@/core/session';
import { revealLines, visibleReveal } from '@/core/word-reveal';
import { usePalette } from './ui';

/** Hidden ink retains line wrapping; VoiceOver can read only words already revealed. */
export function WordRevealContent({ phrase, state, view }: {
  phrase?: { text: string; translation: string }; state: Session; view: 'bubble' | 'list';
}) {
  const c = usePalette();
  const { fontScale } = useWindowDimensions();
  const lines = useMemo(() => phrase ? revealLines(phrase, state.stage) : [], [phrase, state.stage]);
  if (!phrase || !state.reveal) return null;
  const complete = state.phase === 'speaking' || state.phase === 'decision' || state.phase === 'complete';
  const shown = visibleReveal(lines, state.audioSeconds, state.reveal.wpm, complete);
  const background = view === 'bubble' ? c.card : c.blueSoft;
  return <View style={{ alignSelf: view === 'bubble' ? 'flex-start' : 'stretch', maxWidth: '100%', padding: 20,
    gap: 16, backgroundColor: background, borderRadius: view === 'bubble' ? 24 : 14,
    borderBottomLeftRadius: view === 'bubble' ? 6 : 14, borderWidth: 1, borderColor: c.line }}>
    {shown.map((line, index) => <Text key={index} accessible selectable={false} allowFontScaling={false}
      accessibilityLabel={line.visibleText || '문장 표시 대기'}
      style={{ fontSize: (line.kind === 'target' ? 27 : 20) * fontScale,
        lineHeight: (line.kind === 'target' ? 35 : 29) * fontScale,
        fontWeight: line.kind === 'target' ? '700' : '500', color: c.heading, flexShrink: 1 }}>
      {line.spans.map((span, i) => <Text key={i} accessible={false}
        style={{ color: span.visible ? c.heading : background }}>{span.text}</Text>)}
    </Text>)}
  </View>;
}
