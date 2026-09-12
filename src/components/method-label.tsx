import { View } from 'react-native';
import { Label, usePalette } from './ui';
import { levelColors } from './level-colors';

const names = ['자막 쉐도잉', '순간 암기', '첫 단어 힌트', '다문장 암기', '다문장 첫 단어', '속사포 영한', '속사포 한영', '속사포 한글'];

export function MethodLabel({ stage, onAccent = false }: { stage: number; onAccent?: boolean }) {
  const c = usePalette();
  const level = Math.ceil(stage / 2);
  const badgeColor = level <= 2 ? levelColors.mint : level <= 5 ? levelColors.macaw : levelColors.beetle;
  return <View style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'center', gap: 4 }}>
    <View style={{ paddingHorizontal: 5, paddingVertical: 2, borderRadius: 5, backgroundColor: badgeColor }}>
      <Label size={10} weight="800" color="#042c60">Lv {level}</Label>
    </View>
    <Label size={11} weight="700" color={onAccent ? c.onAccent : c.heading}>{names[level - 1]}</Label>
  </View>;
}

export { names as methodNames };
