import { Pressable, ScrollView, View } from 'react-native';
import { router } from 'expo-router';
import { Icon, Label, usePalette } from '@/components/ui';
import { RestorePurchases } from '@/components/restore-purchases';

export default function SettingsScreen() {
  const c = usePalette();
  return <ScrollView contentInsetAdjustmentBehavior="automatic" contentContainerStyle={{ padding: 24, gap: 24, paddingBottom: 40 }}>
      <Pressable onPress={() => router.push('/settings/learning')} accessibilityRole="button" accessibilityLabel="학습 설정" style={({ pressed }) => ({
        minHeight: 64, padding: 20, flexDirection: 'row', alignItems: 'center', gap: 14,
        backgroundColor: pressed ? c.soft : c.card, borderColor: c.line, borderWidth: 2,
        borderRadius: 16, borderCurve: 'continuous',
      })}>
        <Icon name="slider.horizontal.3" color={c.heading} />
        <View style={{ flex: 1 }}><Label size={19} weight="700" color={c.heading}>학습 설정</Label></View>
        <Icon name="chevron.right" size={18} color={c.secondary} />
      </Pressable>
      <RestorePurchases />
  </ScrollView>;
}
