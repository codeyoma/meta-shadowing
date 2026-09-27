import { Children, createContext, isValidElement, use, useCallback, useEffect, useState, type PropsWithChildren } from 'react';
import { View } from 'react-native';

const TitleHeight = createContext<{ id: string; height: number; report(id: string, height: number): void } | null>(null);
const spacing = 24;

export function LibraryGrid({ children }: PropsWithChildren) {
  const [heights, setHeights] = useState<Record<string, number>>({});
  const report = useCallback((id: string, height: number) => {
    if (!Number.isFinite(height) || height < 0) return;
    const rounded = Math.ceil(height);
    setHeights(previous => {
      if ((previous[id] ?? 0) === rounded) return previous;
      const next = { ...previous };
      if (rounded) next[id] = rounded;
      else delete next[id];
      return next;
    });
  }, []);
  const items = Children.toArray(children);
  const ids = items.map((item, index) => String(isValidElement(item) ? item.key ?? index : index));
  return <View style={{ flexDirection: 'row', flexWrap: 'wrap', marginHorizontal: -spacing / 2, rowGap: spacing }}>
    {items.map((item, index) => {
      const row = Math.floor(index / 2) * 2;
      const height = Math.max(...ids.slice(row, row + 2).map(id => heights[id] ?? 0));
      return <TitleHeight key={ids[index]} value={{ id: ids[index]!, height, report }}>{item}</TitleHeight>;
    })}
  </View>;
}

/** Percentage cells retain two equal columns without measuring the screen. */
export function LibraryGridItem({ children }: PropsWithChildren) {
  return <View style={{ width: '50%', paddingHorizontal: spacing / 2 }}>{children}</View>;
}

/** Measure the natural title separately so the shared row height can grow and shrink. */
export function LibraryGridTitle({ children }: PropsWithChildren) {
  const scope = use(TitleHeight);
  const id = scope?.id, report = scope?.report;
  useEffect(() => () => { if (id !== undefined) report?.(id, 0); }, [id, report]);
  if (!scope) return <>{children}</>;
  return <View style={{ minHeight: scope.height }}>
    <View onLayout={event => scope.report(scope.id, event.nativeEvent.layout.height)}>{children}</View>
  </View>;
}
