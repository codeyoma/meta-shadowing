import { useMemo, useState } from 'react';
import { FlatList, Pressable, View } from 'react-native';
import { Icon, Label, usePalette } from './ui';
import { useSettingsColors } from './settings-row';
import { initiallyCollapsedSections, type SentenceSection } from '@/core/sentence-menu';

export function SentenceMenu({ sections, currentUnit, disabled, onSelect }: {
  sections: SentenceSection[]; currentUnit: number; disabled: boolean; onSelect(index: number): void;
}) {
  const c = useSettingsColors(), palette = usePalette();
  const [collapsed, setCollapsed] = useState<Set<number>>(() => initiallyCollapsedSections(sections));
  const items = useMemo(() => sections.flatMap((section, group) => {
    const header = section.title ? [{ kind: 'header' as const, group, title: section.title }] : [];
    return [...header, ...(!section.title || !collapsed.has(group)
      ? section.rows.map(row => ({ kind: 'sentence' as const, group, row })) : [])];
  }), [sections, collapsed]);
  return <FlatList data={items} contentInsetAdjustmentBehavior="automatic" style={{ flex: 1 }}
    contentContainerStyle={{ padding: 16, gap: 8 }}
    keyExtractor={item => item.kind === 'header' ? `header-${item.group}` : `source-${item.row.sourceIndex}`}
    renderItem={({ item }) => item.kind === 'header'
      ? <Pressable accessibilityRole="button" accessibilityLabel={item.title} accessibilityState={{ expanded: !collapsed.has(item.group) }}
        onPress={() => setCollapsed(previous => { const next = new Set(previous); if (next.has(item.group)) next.delete(item.group); else next.add(item.group); return next; })}
        style={{ minHeight: 48, padding: 12, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
        <Label weight="700" color={c.text}>{item.title}</Label><Icon name={collapsed.has(item.group) ? 'chevron.right' : 'chevron.down'} color={c.secondary} />
      </Pressable>
      : <Pressable accessibilityRole="button" accessibilityLabel={`${item.row.sourceIndex + 1}. ${item.row.text}`}
        accessibilityState={{ selected: item.row.unitIndex === currentUnit, disabled }} disabled={disabled}
        onPress={() => onSelect(item.row.sourceIndex)}
        style={{ padding: 16, minHeight: 52, borderRadius: 14, borderCurve: 'continuous', gap: 8,
          backgroundColor: item.row.unitIndex === currentUnit ? palette.blueSoft : c.group }}>
        <View style={{ flexDirection: 'row', gap: 8 }}><Label size={13} color={c.secondary}>{item.row.sourceIndex + 1}</Label>
          {item.row.unitIndex === currentUnit && <Label size={13} color={palette.blue}>현재 학습 구간</Label>}</View>
        <Label color={c.text}>{item.row.text}</Label>
        {!!item.row.translation && <Label size={15} color={c.secondary}>{item.row.translation}</Label>}
      </Pressable>} />;
}
