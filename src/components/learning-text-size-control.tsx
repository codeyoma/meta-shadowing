import { useEffect, useRef, useState } from 'react';
import { Pressable, TextInput, View } from 'react-native';
import { defaultTextSizes, isLearningTextSize, type Settings } from '@/core/settings';
import { Icon, Label } from './ui';
import { SettingsSection } from './settings-section';
import { useSettingsColors } from './settings-row';

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
  return <SettingsSection title={label} paddingVertical={8}>
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
      {([-1, 0, 1] as const).map(direction => direction === 0
        ? <TextInput key="number" accessibilityLabel={label} accessibilityHint="12부터 48까지 입력하세요"
            value={draft} keyboardType="number-pad" selectTextOnFocus
            returnKeyType="done" inputAccessoryViewButtonLabel="완료" submitBehavior="blurAndSubmit"
            onChangeText={show}
            onEndEditing={() => commit(enteredSize())}
            style={{ flex: 1, minWidth: 64, minHeight: 48, paddingVertical: 8, color: c.text,
              textAlign: 'center', fontSize: 20, fontVariant: ['tabular-nums'] }} />
        : <Pressable key={direction} accessibilityRole="button" accessibilityLabel={`${label} ${direction < 0 ? '줄이기' : '늘리기'}`}
            accessibilityState={{ disabled: direction < 0 ? stepSize() <= 12 : stepSize() >= 48 }}
            disabled={direction < 0 ? stepSize() <= 12 : stepSize() >= 48}
            onPress={() => commit(stepSize() + direction)}
            style={({ pressed }) => ({ minWidth: 48, minHeight: 48, alignItems: 'center', justifyContent: 'center',
              borderRadius: 12, backgroundColor: pressed ? c.pressed : c.group,
              opacity: (direction < 0 ? stepSize() <= 12 : stepSize() >= 48) ? 0.3 : 1 })}>
            <Icon name={direction < 0 ? 'minus' : 'plus'} color={c.text} />
          </Pressable>)}
    </View>
  </SettingsSection>;
}

/** Each accepted edit is durable; there is no separate preview/save transaction. */
export function LearningTextSizeControl({ settings, onChange }: {
  settings: Settings | Pick<Settings, 'originalTextSize' | 'translationTextSize'>;
  onChange(patch: Partial<Settings>): boolean | void;
}) {
  const c = useSettingsColors();
  const [reset, setReset] = useState(0);
  return <View style={{ gap: 20 }}>
    <SizeInput key={`original-${reset}`} label="원문 크기" value={settings.originalTextSize ?? defaultTextSizes.originalTextSize}
      onChange={originalTextSize => onChange({ originalTextSize })} />
    <SizeInput key={`translation-${reset}`} label="번역 크기" value={settings.translationTextSize ?? defaultTextSizes.translationTextSize}
      onChange={translationTextSize => onChange({ translationTextSize })} />
    <Pressable accessibilityRole="button" accessibilityLabel="글자 크기 초기화" onPress={() => {
      if (onChange({ ...defaultTextSizes }) !== false) setReset(value => value + 1);
    }} style={({ pressed }) => ({ minHeight: 44, justifyContent: 'center', paddingHorizontal: 16, opacity: pressed ? 0.5 : 1 })}>
      <Label color="#007aff">글자 크기 초기화</Label>
    </Pressable>
    <SettingsSection title="미리보기">
      <Label size={settings.originalTextSize ?? defaultTextSizes.originalTextSize} color={c.text}>A little practice every day.</Label>
      <Label size={settings.translationTextSize ?? defaultTextSizes.translationTextSize} color={c.text}>매일 조금씩 연습해요.</Label>
    </SettingsSection>
  </View>;
}
