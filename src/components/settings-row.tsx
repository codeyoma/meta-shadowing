import { Pressable, StyleSheet, View, useColorScheme } from 'react-native';
import type { ComponentProps } from 'react';
import { Icon, Label } from './ui';
import { palettes } from './theme';

export function useSettingsColors() {
  const dark = useColorScheme() === 'dark';
  return {
    background: dark ? palettes.dark.background : '#f2f2f7',
    group: dark ? '#1c1c1e' : '#ffffff',
    pressed: dark ? '#3a3a3c' : '#e5e5ea',
    text: dark ? '#ffffff' : '#000000',
    secondary: dark ? '#98989d' : '#8e8e93',
    separator: dark ? '#38383a' : '#e5e5ea',
  };
}

/** Navigation rows show a disclosure; immediate actions deliberately do not. */
export function SettingsRow({ title, icon, iconColor, onPress, disclosure = false, separator = false, disabled = false }: {
  title: string;
  icon: ComponentProps<typeof Icon>['name'];
  iconColor: string;
  onPress(): void;
  disclosure?: boolean;
  separator?: boolean;
  disabled?: boolean;
}) {
  const c = useSettingsColors();
  return <View>
    <Pressable accessibilityRole="button" accessibilityLabel={title} accessibilityState={{ disabled }}
      disabled={disabled} onPress={onPress} style={({ pressed }) => ({
        minHeight: 52, paddingHorizontal: 16, paddingVertical: 10,
        flexDirection: 'row', alignItems: 'center', gap: 12,
        backgroundColor: pressed ? c.pressed : c.group,
      })}>
      <View style={{ width: 30, height: 30, borderRadius: 7, borderCurve: 'continuous',
        alignItems: 'center', justifyContent: 'center', backgroundColor: iconColor, opacity: disabled ? 0.45 : 1 }}>
        <Icon name={icon} size={19} color="#ffffff" />
      </View>
      <View style={{ flex: 1 }}>
        <Label size={17} weight="400" color={disabled ? c.secondary : c.text}>{title}</Label>
      </View>
      {disclosure && <Icon name="chevron.right" size={14} color={c.secondary} />}
    </Pressable>
    {separator && <View style={{ marginLeft: 58, marginRight: 16, height: StyleSheet.hairlineWidth, backgroundColor: c.separator }} />}
  </View>;
}
