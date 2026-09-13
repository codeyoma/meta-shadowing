import type { PropsWithChildren } from 'react';
import { View } from 'react-native';
import { Label } from './ui';
import { useSettingsColors } from './settings-row';

export function SettingsSection({ title, note, children, paddingVertical = 16 }: PropsWithChildren<{ title?: string; note?: string; paddingVertical?: number }>) {
  const c = useSettingsColors();
  return <View style={{ gap: 8 }}>
    {title && <View style={{ paddingHorizontal: 16 }}><Label size={18} weight="600" color={c.secondary}>{title}</Label></View>}
    <View style={{ paddingHorizontal: 16, paddingVertical, gap: 16, backgroundColor: c.group, borderRadius: 24, borderCurve: 'continuous' }}>{children}</View>
    {note && <View style={{ paddingHorizontal: 16 }}><Label size={13} color={c.secondary}>{note}</Label></View>}
  </View>;
}
