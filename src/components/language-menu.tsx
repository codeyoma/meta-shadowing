import { useState } from 'react';
import { View, useWindowDimensions } from 'react-native';
import { Host, Menu, Picker, Text, VStack } from '@expo/ui/swift-ui';
import { accessibilityLabel, buttonStyle, font, foregroundStyle, frame, offset, pickerStyle, tag } from '@expo/ui/swift-ui/modifiers';
import { languages } from '@/native/catalog';
import { useLibrary } from './library-context';
import { usePalette } from './ui';
import { tapFeedback } from '@/native/tap-feedback';

/** One tap opens Apple's selection menu at the flag, without a navigation sheet. */
export function LanguageMenu() {
  const { selection, select } = useLibrary();
  const [revision, setRevision] = useState(0);
  const { fontScale } = useWindowDimensions();
  const c = usePalette();
  const language = languages.find(item => item.id === selection.language) ?? languages[0];
  // Observe contact without taking the responder from Apple's single-tap menu.
  // Picker selection keeps its system feedback; this is only the flag trigger.
  return <View onTouchStart={() => tapFeedback()}>
    <Host key={revision} matchContents style={{ minWidth: 48, minHeight: 48 }}>
    <Menu modifiers={[buttonStyle('plain'), accessibilityLabel(`학습 언어 선택, 현재 ${language.name}`)]}
      label={<VStack spacing={4} modifiers={[frame({ minWidth: 48, minHeight: 48 })]}>
        <Text modifiers={[font({ size: 28 * fontScale })]}>{language.flag}</Text>
        <Text modifiers={[font({ size: 12 * fontScale, weight: 'bold' }), foregroundStyle(c.heading), offset({ y: -3 })]}>{language.displayCode}</Text>
      </VStack>}>
      <Picker label="학습 언어" selection={language.id} modifiers={[pickerStyle('inline')]}
        onSelectionChange={(next: string) => {
          if (next === selection.language || !languages.some(item => item.id === next)) return;
          if (!select({ language: next, book: null })) setRevision(value => value + 1);
        }}>
        {languages.map(item => <Text key={item.id} modifiers={[tag(item.id)]}>{item.flag} {item.name}</Text>)}
      </Picker>
    </Menu>
    </Host>
  </View>;
}
