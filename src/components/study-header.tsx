import { View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { languages } from '@/native/catalog';
import { useLibrary } from './library-context';
import { Icon, Label, ProgressTrack, usePalette } from './ui';
import { LanguageMenu } from './language-menu';

export function StudyHeader() {
  const c = usePalette();
  const insets = useSafeAreaInsets();
  const { selection, progress: snapshot } = useLibrary();
  const language = languages.find(l => l.id === selection.language) ?? languages[0];
  const progress = snapshot?.summary;
  return <View style={{ backgroundColor: c.background, paddingTop: insets.top, borderBottomWidth: 2, borderBottomColor: c.line }}>
    <View style={{ paddingHorizontal: 24, paddingVertical: 12, flexDirection: 'row', gap: 20, alignItems: 'center' }}>
      <LanguageMenu />
      <View style={{ flex: 1, alignSelf: 'stretch', justifyContent: 'space-between', paddingTop: 8.5 }}>
        <ProgressTrack height={8} value={progress?.current ?? 0} total={progress?.required ?? 100} label={`${language.name} 다음 레벨 경험치`} />
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'baseline', justifyContent: 'space-between', gap: 8 }}>
          <Label size={19} display color={c.heading}>Lv. {progress?.level ?? '—'}</Label>
          <View style={{ flexGrow: 1, alignItems: 'flex-end' }}>
            <Label size={12} muted align="right">{progress?.maxLevel ? 'MAX' : progress ? `${progress.current} / ${progress.required} XP` : '— XP'}</Label>
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
