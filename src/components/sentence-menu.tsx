import { useEffect, useMemo, useRef, useState } from 'react';
import { FlatList, Pressable, View } from 'react-native';
import { useHeaderHeight } from 'expo-router/react-navigation';
import { Icon, Label, usePalette } from './ui';
import { useSettingsColors } from './settings-row';
import { initiallyCollapsedSections, type SentenceSection } from '@/core/sentence-menu';

export function SentenceMenu({ sections, currentUnit, disabled, onSelect }: {
  sections: SentenceSection[]; currentUnit: number; disabled: boolean; onSelect(index: number): void;
}) {
  const c = useSettingsColors(), palette = usePalette();
  const headerHeight = useHeaderHeight();
  const [collapsed, setCollapsed] = useState<Set<number>>(() => initiallyCollapsedSections(sections, currentUnit));
  const [height, setHeight] = useState(0);
  const items = useMemo(() => sections.flatMap((section, group) => {
    const header = section.title ? [{ kind: 'header' as const, group, title: section.title }] : [];
    return [...header, ...(!section.title || !collapsed.has(group)
      ? section.rows.map(row => ({ kind: 'sentence' as const, group, row })) : [])];
  }), [sections, collapsed]);
  const list = useRef<FlatList<(typeof items)[number]>>(null);
  const positioning = useRef({ pending: true, cancelled: false, attempts: 0, viewport: 0 });
  const retry = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const target = items.findIndex(item => item.kind === 'sentence' && item.row.unitIndex === currentUnit);
  function stopPositioning() {
    positioning.current.pending = false; positioning.current.cancelled = true;
    clearTimeout(retry.current);
  }
  function centerCurrent() {
    const position = positioning.current;
    if (!position.pending || position.cancelled || !position.viewport || target < 0 || !list.current) return;
    if (position.attempts++ >= 8) { stopPositioning(); return; }
    position.pending = false;
    // Exclude the transparent native header from the visible center.
    list.current.scrollToIndex({ index: target, viewPosition: 0.5, viewOffset: headerHeight / 2, animated: false });
  }
  function scheduleCenter() {
    clearTimeout(retry.current);
    retry.current = setTimeout(centerCurrent, 100);
  }
  useEffect(() => {
    setCollapsed(initiallyCollapsedSections(sections, currentUnit));
    positioning.current = { ...positioning.current, pending: true, cancelled: false, attempts: 0 };
    scheduleCenter();
    return stopPositioning;
  }, [sections, currentUnit, headerHeight]);
  return <FlatList ref={list} data={items} contentInsetAdjustmentBehavior="automatic" style={{ flex: 1 }}
    onLayout={({ nativeEvent }) => {
      positioning.current.viewport = nativeEvent.layout.height;
      setHeight(nativeEvent.layout.height);
      if (!positioning.current.cancelled) { positioning.current.pending = true; scheduleCenter(); }
    }}
    onContentSizeChange={() => {
      // Wait for row measurements after viewport padding / section expansion
      // commits; centering against the previous row frames shifts the target.
      if (!positioning.current.cancelled) { positioning.current.pending = true; scheduleCenter(); }
    }} onScrollBeginDrag={stopPositioning}
    onScrollToIndexFailed={({ index, averageItemLength }) => {
      if (positioning.current.cancelled || index !== target || positioning.current.attempts >= 8) return;
      positioning.current.pending = true;
      // Variable-height rows may not yet be measured. Bring the target window
      // into the render range, then retry exact centering; never retry forever.
      list.current?.scrollToOffset({ offset: averageItemLength * index, animated: false });
      scheduleCenter();
    }}
    contentContainerStyle={{ paddingHorizontal: 16, paddingVertical: Math.max(16, height / 2), gap: 8 }}
    keyExtractor={item => item.kind === 'header' ? `header-${item.group}` : `source-${item.row.sourceIndex}`}
    renderItem={({ item }) => item.kind === 'header'
      ? <Pressable accessibilityRole="button" accessibilityLabel={item.title} accessibilityState={{ expanded: !collapsed.has(item.group) }}
        onPress={() => { stopPositioning(); setCollapsed(previous => { const next = new Set(previous); if (next.has(item.group)) next.delete(item.group); else next.add(item.group); return next; }); }}
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
