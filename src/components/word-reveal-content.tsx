import { useMemo } from 'react';
import { Text, View, useWindowDimensions } from 'react-native';
import type { Session } from '@/core/session';
import { revealLines, visibleReveal } from '@/core/word-reveal';
import { usePalette } from './ui';
import type { LearningTypography } from '@/core/settings';
import { learningFontFamily } from '@/native/learning-fonts';
import { SubtitleText, type WordLookup } from './subtitle-text';

/** Hidden ink retains line wrapping; VoiceOver can read only words already revealed. */
export function WordRevealContent({ phrase, state, view, typography, onLookup }: {
  phrase?: { text: string; translation: string }; state: Session; view: 'bubble' | 'list';
  typography?: LearningTypography;
  onLookup?: WordLookup;
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
    {shown.map((line, index) => {
      const fontFamily = learningFontFamily(line.kind === 'target' ? typography?.originalTextFont : typography?.translationTextFont);
      const size = line.kind === 'target' ? typography?.originalTextSize ?? 27 : typography?.translationTextSize ?? 20;
      const lineHeight = size * (line.kind === 'target' ? (fontFamily ? 1.45 : 35 / 27) : 29 / 20);
      if (complete && onLookup) return <SubtitleText key={index} text={line.text} masked={false}
        background={background} color={c.heading} size={size} lineHeight={lineHeight} fontFamily={fontFamily}
        weight={fontFamily ? '400' : line.kind === 'target' ? '700' : '500'} onLookup={onLookup} />;
      return <Text key={index} accessible selectable={false} allowFontScaling={false}
      accessibilityLabel={line.visibleText || '문장 표시 대기'}
      style={{ fontSize: size * fontScale, lineHeight: lineHeight * fontScale,
        fontFamily, fontWeight: fontFamily ? '400' : line.kind === 'target' ? '700' : '500', color: c.heading, flexShrink: 1 }}>
      {line.spans.map((span, i) => <Text key={i} accessible={false}
        style={{ color: span.visible ? c.heading : background }}>{span.text}</Text>)}
    </Text>; })}
  </View>;
}
