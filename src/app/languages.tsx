import { ScrollView } from 'react-native';
import { useState } from 'react';
import { Stack, router } from 'expo-router';
import { HeaderButton } from '@/components/ui';
import { SettingsSection } from '@/components/settings-section';
import { SystemPicker } from '@/components/system-picker';
import { useLibrary } from '@/components/library-context';
import { languages } from '@/native/catalog';

export default function LanguageSelection() {
  const { selection, select } = useLibrary();
  const [pickerRevision, setPickerRevision] = useState(0);
  return <ScrollView contentInsetAdjustmentBehavior="automatic" contentContainerStyle={{ padding: 24, gap: 16 }}>
    <Stack.Screen options={{ title: '학습 언어', headerRight: () => <HeaderButton title="닫기" icon="xmark" onPress={() => router.back()} /> }} />
    <SettingsSection title="학습 언어">
      <SystemPicker key={pickerRevision} menu label="언어 선택" value={selection.language}
        options={languages.map(language => ({ value: language.id, label: `${language.flag} ${language.name}` }))}
        onChange={language => {
          if (select({ language, book: null })) router.back();
          else setPickerRevision(value => value + 1);
        }} />
    </SettingsSection>
  </ScrollView>;
}
