import { useState } from 'react';
import { View, useWindowDimensions } from 'react-native';
import { Host, Menu, Picker, Spacer, Text, VStack } from '@expo/ui/swift-ui';
import { accessibilityLabel, buttonStyle, font, frame, pickerStyle, tag } from '@expo/ui/swift-ui/modifiers';
import { languages } from '@/native/catalog';
import { useLibrary } from './library-context';
import { Label, usePalette } from './ui';
import { tapFeedback } from '@/native/tap-feedback';

/** One tap opens Apple's selection menu at the flag, without a navigation sheet. */
export function LanguageMenu({ visualRowHeight }: { visualRowHeight: number }) {
  const { selection, select } = useLibrary();
  const [revision, setRevision] = useState(0);
  const { fontScale } = useWindowDimensions();
  const c = usePalette();
  const language = languages.find(item => item.id === selection.language) ?? languages[0];
  // Observe contact without taking the responder from Apple's single-tap menu.
  // Picker selection keeps its system feedback; this is only the flag trigger.
  return <View onTouchStart={() => tapFeedback()} style={{ alignSelf: 'stretch', justifyContent: 'flex-start' }}>
    <Host key={revision} matchContents style={{ minWidth: 48, minHeight: 48 }}>
    <Menu modifiers={[buttonStyle('plain'), accessibilityLabel(`학습 언어 선택, 현재 ${language.name}`)]}
      label={<VStack spacing={4} modifiers={[frame({ minWidth: 48, minHeight: 48, alignment: 'top' })]}>
        <Text modifiers={[font({ size: 28 * fontScale }), frame({ height: visualRowHeight, alignment: 'center' })]}>{language.flag}</Text>
        <Spacer modifiers={[frame({ height: 12 * fontScale * 1.2 })]} />
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
    {/* Share text metrics with the neighboring counters without intercepting the native menu. */}
    <View pointerEvents="none" accessibilityElementsHidden
      style={{ position: 'absolute', bottom: 0, left: 0, right: 0, alignItems: 'center' }}>
      <Label size={12} display color={c.heading}>{language.displayCode}</Label>
    </View>
  </View>;
}
