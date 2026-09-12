import { View } from 'react-native';
import { FeedbackPressable as Pressable } from './feedback-pressable';
import { Image } from 'expo-image';
import { bookAction } from '@/core/stage-overview';
import { Card, Icon, Label, ProgressTrack, usePalette } from './ui';

export function BookCard({ title, sentences, chapters, completed, owned, installed, busy, onPress }: {
  title: string; sentences: number; chapters: number | null; completed: number | null;
  owned: boolean; installed: boolean; busy?: string; onPress(): void;
}) {
  const c = usePalette();
  const action = bookAction(owned, installed);
  const actionTitle = action === 'purchase' ? '구매하기' : action === 'download' ? '다운로드' : '이어하기';
  return <Card style={{ padding: 12, gap: 12, flexDirection: 'row', alignItems: 'center' }}>
    <Image source={require('../../assets/illustrations/morning-notes.png')} accessible={false}
      contentFit="cover" style={{ width: 70, height: 94, borderRadius: 12 }} />
    <View style={{ flex: 1, minHeight: 94, gap: 6, justifyContent: 'space-between' }}>
      <View style={{ gap: 3 }}>
        <Label size={19} display color={c.heading}>{title}</Label>
        <Label size={13} muted>총 {sentences}문장 / 챕터 {chapters === null ? '—' : `${chapters}개`}</Label>
      </View>
      <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: 8 }}>
        <View style={{ flex: 1 }}><ProgressTrack label="도서 스테이지 진행" value={completed ?? 0} total={16} /></View>
        <Label size={12} weight="700" color={c.heading}>{completed ?? '—'}/16</Label>
      </View>
    </View>
    <Pressable accessibilityRole="button" accessibilityLabel={`${title} ${busy ?? actionTitle}`}
      disabled={!!busy} accessibilityState={{ disabled: !!busy }} onPress={onPress}
      style={({ pressed }) => ({ minWidth: 44, minHeight: 48, maxWidth: 78, padding: 8, borderRadius: 12,
        alignItems: 'center', justifyContent: 'center', backgroundColor: action === 'resume' ? c.soft : c.accent,
        opacity: busy ? 0.5 : pressed ? 0.6 : 1 })}>
      {busy ? <Label size={11} align="center">{busy}</Label>
        : action === 'resume' ? <Icon name="arrow.right" size={23} />
          : <Label size={13} weight="800" align="center" color={c.onAccent}>{actionTitle}</Label>}
    </Pressable>
  </Card>;
}
