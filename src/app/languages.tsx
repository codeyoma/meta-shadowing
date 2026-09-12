import { ScrollView } from 'react-native';
import { Stack, router } from 'expo-router';
import { Choice, HeaderButton } from '@/components/ui';
import { useLibrary } from '@/components/library-context';
import { languages } from '@/native/catalog';

export default function LanguageSelection() {
  const { selection, select } = useLibrary();
  return <ScrollView contentInsetAdjustmentBehavior="automatic" contentContainerStyle={{ padding: 24, gap: 16 }}>
    <Stack.Screen options={{ title: '학습 언어', headerRight: () => <HeaderButton title="닫기" icon="xmark" onPress={() => router.back()} /> }} />
    {languages.map(language => <Choice key={language.id} selectionFill={false} title={`${language.flag} ${language.name}`} selected={selection.language === language.id}
      onPress={() => { if (select({ language: language.id, book: null })) router.back(); }} />)}
  </ScrollView>;
}
