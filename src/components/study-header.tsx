import { Pressable, Text, View, useWindowDimensions } from 'react-native';
import { router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { languages } from '@/native/catalog';
import { useLibrary } from './library-context';
import { Icon, Label, ProgressTrack, usePalette } from './ui';

export function StudyHeader() {
  const c = usePalette();
  const insets = useSafeAreaInsets();
  const { fontScale } = useWindowDimensions();
  const { selection, progress: snapshot } = useLibrary();
  const language = languages.find(l => l.id === selection.language) ?? languages[0];
  const progress = snapshot?.summary;
  return <View style={{ backgroundColor: c.background, paddingTop: insets.top, borderBottomWidth: 2, borderBottomColor: c.line }}>
    <View style={{ paddingHorizontal: 24, paddingVertical: 12, flexDirection: 'row', gap: 20, alignItems: 'flex-end' }}>
      <Pressable accessibilityRole="button" accessibilityLabel={`학습 언어 선택, 현재 ${language.name}`}
        onPress={() => router.push('/languages')} style={({ pressed }) => ({ minWidth: 48, minHeight: 48,
          paddingHorizontal: 6, paddingTop: 6, justifyContent: 'flex-end', alignItems: 'center', opacity: pressed ? 0.6 : 1 })}>
        <Text accessible={false} allowFontScaling={false} style={{ fontSize: 28 * fontScale, lineHeight: 28 * fontScale }}>{language.flag}</Text>
        <Label size={12} weight="700" color={c.heading} align="center">{language.displayCode}</Label>
      </Pressable>
      <View style={{ flex: 1, gap: 4 }}>
        <ProgressTrack height={8} value={progress?.current ?? 0} total={progress?.required ?? 100} label={`${language.name} 다음 레벨 경험치`} />
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'baseline', justifyContent: 'space-between', gap: 8 }}>
          <Label size={19} display color={c.heading}>Lv. {progress?.level ?? '—'}</Label>
          <View style={{ flexGrow: 1, alignItems: 'flex-end' }}>
            <Label size={12} muted align="right">{progress ? `${progress.current} / ${progress.required} XP` : '— XP'}</Label>
          </View>
        </View>
      </View>
      <View accessible accessibilityLabel={`${language.name} 연속 학습 ${progress?.streak ?? '확인 중'}일`}
        style={{ minWidth: 48, alignItems: 'center', gap: 0 }}>
        <Icon name="flame.fill" color={progress?.streak ? c.accentPressed : c.secondary} size={25} />
        <Label size={20} display color={c.heading}>{progress?.streak ?? '—'}</Label>
      </View>
    </View>
  </View>;
}
