import { useEffect, useRef, useState } from 'react';
import { Pressable, TextInput, View } from 'react-native';
import { defaultTextSizes, defaultTextFonts, isLearningTextSize, type Settings, type LearningTypography } from '@/core/settings';
import { Icon, Label } from './ui';
import { SettingsSection } from './settings-section';
import { useSettingsColors } from './settings-row';
import { LearningFontControl } from './learning-font-control';
import { learningFontFamily } from '@/native/learning-fonts';

function SizeInput({ label, value, onChange }: {
  label: string; value: number; onChange(value: number): boolean | void;
}) {
  const c = useSettingsColors();
  const [draft, setDraft] = useState(String(value));
  const accepted = useRef(value);
  const input = useRef(String(value));
  function show(text: string) { input.current = text; setDraft(text); }
  useEffect(() => { accepted.current = value; show(String(value)); }, [value]);
  function commit(next: number) {
    if (!isLearningTextSize(next) || onChange(next) === false) { show(String(accepted.current)); return; }
    accepted.current = next; show(String(next));
  }
  const enteredSize = () => /^\d{2}$/.test(input.current) ? Number(input.current) : NaN;
  const stepSize = () => isLearningTextSize(enteredSize()) ? enteredSize() : accepted.current;
  return <View style={{ flex: 1, minWidth: 0, gap: 8 }}>
    <View style={{ paddingHorizontal: 8 }}><Label size={15} weight="600" color={c.secondary}>{label}</Label></View>
    <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 4, paddingVertical: 8,
      backgroundColor: c.group, borderRadius: 24, borderCurve: 'continuous' }}>
      {([-1, 0, 1] as const).map(direction => direction === 0
        ? <TextInput key="number" accessibilityLabel={label} accessibilityHint="12부터 48까지 입력하세요"
            value={draft} keyboardType="number-pad" selectTextOnFocus
            returnKeyType="done" inputAccessoryViewButtonLabel="완료" submitBehavior="blurAndSubmit"
            onChangeText={show}
            onEndEditing={() => commit(enteredSize())}
            style={{ flex: 1, minWidth: 0, minHeight: 48, paddingVertical: 8, color: c.text,
              textAlign: 'center', fontSize: 20, fontVariant: ['tabular-nums'] }} />
        : <Pressable key={direction} accessibilityRole="button" accessibilityLabel={`${label} ${direction < 0 ? '줄이기' : '늘리기'}`}
            accessibilityState={{ disabled: direction < 0 ? stepSize() <= 12 : stepSize() >= 48 }}
            disabled={direction < 0 ? stepSize() <= 12 : stepSize() >= 48}
            onPress={() => commit(stepSize() + direction)}
            style={({ pressed }) => ({ minWidth: 44, minHeight: 48, alignItems: 'center', justifyContent: 'center',
              borderRadius: 12, backgroundColor: pressed ? c.pressed : c.group,
              opacity: (direction < 0 ? stepSize() <= 12 : stepSize() >= 48) ? 0.3 : 1 })}>
            <Icon name={direction < 0 ? 'minus' : 'plus'} color={c.text} />
          </Pressable>)}
    </View>
  </View>;
}

/** Each accepted edit is durable; there is no separate preview/save transaction. */
export function LearningTypographyControl({ settings, onChange }: {
  settings: LearningTypography;
  onChange(patch: Partial<Settings>): boolean | void;
}) {
  const c = useSettingsColors();
  const [reset, setReset] = useState(0);
  return <View style={{ gap: 20, paddingTop: 12 }}>
    <View style={{ paddingHorizontal: 16 }}><Label size={18} weight="600" color={c.secondary}>폰트 설정</Label></View>
    <LearningFontControl label="원문 폰트" value={settings.originalTextFont} onChange={originalTextFont => onChange({ originalTextFont })} />
    <LearningFontControl label="번역 폰트" value={settings.translationTextFont} onChange={translationTextFont => onChange({ translationTextFont })} />
    <View style={{ paddingHorizontal: 8 }}><Label size={14} color={c.secondary}>일부 폰트의 한글은 시스템 글꼴로 표시돼요.</Label></View>
    <View style={{ flexDirection: 'row', gap: 12 }}>
      <SizeInput key={`original-${reset}`} label="원문 폰트 크기" value={settings.originalTextSize ?? defaultTextSizes.originalTextSize}
        onChange={originalTextSize => onChange({ originalTextSize })} />
      <SizeInput key={`translation-${reset}`} label="번역 폰트 크기" value={settings.translationTextSize ?? defaultTextSizes.translationTextSize}
        onChange={translationTextSize => onChange({ translationTextSize })} />
    </View>
    <SettingsSection>
      <Label size={settings.originalTextSize ?? defaultTextSizes.originalTextSize} fontFamily={learningFontFamily(settings.originalTextFont)} color={c.text}>A little practice every day helps me speak clearly and feel more confident.</Label>
      <Label size={settings.translationTextSize ?? defaultTextSizes.translationTextSize} fontFamily={learningFontFamily(settings.translationTextFont)} color={c.text}>매일 조금씩 연습하면 더 또렷하고 자신 있게 말할 수 있어요.</Label>
    </SettingsSection>
    <Pressable accessibilityRole="button" accessibilityLabel="폰트 초기화"
      onPress={() => onChange({ ...defaultTextFonts })}
      style={({ pressed }) => ({ minHeight: 48, paddingHorizontal: 16, paddingVertical: 12,
        flexDirection: 'row', gap: 8, alignItems: 'center', justifyContent: 'center',
        borderWidth: 1, borderColor: c.separator, borderRadius: 16, borderCurve: 'continuous',
        backgroundColor: pressed ? c.pressed : c.group })}>
      <Icon name="arrow.counterclockwise" size={18} color="#007aff" />
      <Label size={16} weight="600" align="center" color="#007aff">폰트 초기화</Label>
    </Pressable>
    <Pressable accessibilityRole="button" accessibilityLabel="폰트 크기 초기화" onPress={() => {
      if (onChange({ ...defaultTextSizes }) !== false) setReset(value => value + 1);
    }} style={({ pressed }) => ({ minHeight: 48, paddingHorizontal: 16, paddingVertical: 12,
      flexDirection: 'row', gap: 8, alignItems: 'center', justifyContent: 'center',
      borderWidth: 1, borderColor: c.separator, borderRadius: 16, borderCurve: 'continuous',
      backgroundColor: pressed ? c.pressed : c.group })}>
      <Icon name="arrow.counterclockwise" size={18} color="#007aff" />
      <Label size={16} weight="600" align="center" color="#007aff">폰트 크기 초기화</Label>
    </Pressable>
  </View>;
}
