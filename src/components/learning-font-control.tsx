import { Pressable, View } from 'react-native';
import { learningFonts, type LearningFont } from '@/core/learning-fonts';
import { availableFontChoices } from '@/native/learning-fonts';
import { Icon, Label } from './ui';
import { useSettingsColors } from './settings-row';

export function LearningFontControl({ label, value, onChange }: {
  label: string; value?: LearningFont; onChange(value: LearningFont): boolean | void;
}) {
  const c = useSettingsColors();
  const unavailable = value !== undefined && !availableFontChoices.some(font => font.id === value);
  return <View style={{ gap: 8 }}>
    <View style={{ paddingHorizontal: 8 }}><Label size={15} weight="600" color={c.secondary}>{label}</Label></View>
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
      {availableFontChoices.map(font => {
        const selected = (value ?? 'system') === font.id;
        return <Pressable key={font.id} accessibilityRole="radio" accessibilityLabel={`${label}: ${font.label}`}
          accessibilityState={{ checked: selected }} onPress={() => onChange(font.id)}
          style={({ pressed }) => ({ flexGrow: 1, flexBasis: 100, minHeight: 48, paddingHorizontal: 12, paddingVertical: 10,
            borderRadius: 16, borderCurve: 'continuous', borderWidth: 1, borderColor: selected ? '#007aff' : c.separator,
            backgroundColor: pressed ? c.pressed : c.group, flexDirection: 'row', alignItems: 'center', gap: 6 })}>
          <View style={{ flex: 1 }}><Label size={15} color={selected ? '#007aff' : c.text}>{font.label}</Label></View>
          {selected && <Icon name="checkmark" size={14} color="#007aff" />}
        </Pressable>;
      })}
    </View>
    {unavailable && <Label size={14} color={c.secondary}>{`${learningFonts.find(font => font.id === value)?.label} · System으로 표시`}</Label>}
  </View>;
}
