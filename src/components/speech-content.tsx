import { View } from 'react-native';
import { Label, usePalette } from './ui';
import { groupedSpeechBubbles } from '@/core/grouped-speech';
import { SubtitleText } from './subtitle-text';
import type { LearningTypography } from '@/core/settings';
import { learningFontFamily } from '@/native/learning-fonts';

/** Display only the active unit; the player owns scrolling for long content. */
export function SpeechContent({ phrases, active, view, unitLabel = '학습 구간', textSizes }: {
  phrases: readonly { text: string; translation: string; masked?: boolean; members?: { text: string; translation: string }[] }[]; active: number; view: 'bubble' | 'list'; unitLabel?: string;
  textSizes?: LearningTypography;
}) {
  const c = usePalette();
  const phrase = phrases[active];
  if (!phrase) return null;
  const members = phrase.members ?? [phrase];
  const bubbles = groupedSpeechBubbles(members);
  if (view === 'bubble') return <View style={{ gap: 16 }}>
    {phrase && bubbles.map((pairs, index) => <View key={index} style={{
      alignSelf: index % 2 === 0 ? 'flex-start' : 'flex-end', maxWidth: '94%', gap: 12,
      backgroundColor: index % 2 === 0 ? c.card : c.blueSoft, borderRadius: 24,
      borderBottomLeftRadius: index % 2 === 0 ? 6 : 24, borderBottomRightRadius: index % 2 === 0 ? 24 : 6,
      padding: 20, borderWidth: 1, borderColor: index % 2 === 0 ? c.line : c.blueSoft,
    }}>
      <View style={{ gap: 16 }}>{pairs.map((pair, member) => <View key={member} style={{ gap: 8 }}>
        <SubtitleText text={pair.text} masked={!!phrase.masked} size={textSizes?.originalTextSize ?? 29} display color={c.heading}
          fontFamily={learningFontFamily(textSizes?.originalTextFont)} background={index % 2 === 0 ? c.card : c.blueSoft} />
        {!!pair.translation && <Label size={textSizes?.translationTextSize ?? 18} fontFamily={learningFontFamily(textSizes?.translationTextFont)} color={c.heading}>{pair.translation}</Label>}
      </View>)}</View>
    </View>)}
  </View>;
  return <View style={{ padding: 16, gap: 8, borderRadius: 14, backgroundColor: c.blueSoft,
    borderLeftWidth: 3, borderLeftColor: c.blue }}>
      <Label size={13} muted>{active + 1} · 현재 {unitLabel}</Label>
      <View style={{ gap: 16 }}>{bubbles.flat().map((member, memberIndex) => <View key={memberIndex} style={{ gap: 8 }}>
        <SubtitleText text={member.text} masked={!!phrase.masked} size={textSizes?.originalTextSize ?? 24}
          weight="700" color={c.heading} background={c.blueSoft} fontFamily={learningFontFamily(textSizes?.originalTextFont)} />
        {!!member.translation && <Label size={textSizes?.translationTextSize ?? 16} fontFamily={learningFontFamily(textSizes?.translationTextFont)} muted>{member.translation}</Label>}
      </View>)}</View>
  </View>;
}
