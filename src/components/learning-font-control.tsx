import { View, useWindowDimensions } from 'react-native';
import { Button, Host, HStack, Image, Menu, Spacer, Text } from '@expo/ui/swift-ui';
import { accessibilityAddTraits, accessibilityLabel, buttonStyle, font, foregroundStyle, frame, padding } from '@expo/ui/swift-ui/modifiers';
import { learningFonts, type LearningFont } from '@/core/learning-fonts';
import { availableFontChoices } from '@/native/learning-fonts';
import { Label } from './ui';
import { useSettingsColors } from './settings-row';

export function LearningFontControl({ label, value, onChange }: {
  label: string; value?: LearningFont; onChange(value: LearningFont): boolean | void;
}) {
  const c = useSettingsColors();
  const { fontScale } = useWindowDimensions();
  const current = learningFonts.find(font => font.id === (value ?? 'system'))!;
  const unavailable = value !== undefined && !availableFontChoices.some(font => font.id === value);
  return <View style={{ flex: 1, minWidth: 0, gap: 8 }}>
    <View style={{ paddingHorizontal: 8 }}><Label size={15} weight="600" color={c.secondary}>{label}</Label></View>
    <View style={{ backgroundColor: c.group, borderRadius: 24, borderCurve: 'continuous', borderWidth: 1, borderColor: c.separator }}>
      <Host matchContents={{ vertical: true }} style={{ width: '100%', minHeight: 64 }}>
        <Menu modifiers={[buttonStyle('plain'), accessibilityLabel(`${label} 선택, 현재 ${current.label}`)]}
          label={<HStack spacing={6} modifiers={[padding({ horizontal: 12, vertical: 12 }), frame({ minHeight: 64 })]}>
            <Text modifiers={[font({ size: 15 * fontScale }), foregroundStyle(c.text)]}>{current.label}</Text>
            <Spacer />
            <Image systemName="chevron.up.chevron.down" size={12 * fontScale} color={c.secondary} />
          </HStack>}>
          {availableFontChoices.map(choice => {
            const selected = current.id === choice.id;
            return <Button key={choice.id} label={choice.label} systemImage={selected ? 'checkmark' : undefined}
              modifiers={[accessibilityLabel(`${label}: ${choice.label}`), ...(selected ? [accessibilityAddTraits(['isSelected'])] : [])]}
              onPress={() => onChange(choice.id)} />;
          })}
        </Menu>
      </Host>
    </View>
    {unavailable && <Label size={14} color={c.secondary}>{`${current.label} · System으로 표시`}</Label>}
  </View>;
}
