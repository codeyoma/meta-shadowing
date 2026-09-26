import { Image } from 'expo-image';
import { View } from 'react-native';
import { Label, usePalette } from './ui';
import type { WordRelation } from '@/core/sentence-relations';

/** Quadratic curves are decorative; native labels and explanation cards carry semantics. */
export function DependencyArcs({ edges, boxes, selected, scale }: {
  edges: WordRelation[]; boxes: Record<number, { x: number; width: number }>; selected: number | null; scale: number;
}) {
  const c = usePalette();
  const lanes: { left: number; right: number }[][] = [];
  const attached = edges.filter(e => boxes[e.head] && boxes[e.dependent])
    .map(edge => ({ edge, head: 0, dependent: 0 }));
  const ports = new Map<number, { arc: typeof attached[number]; end: 'head' | 'dependent'; other: number }[]>();
  for (const arc of attached) for (const end of ['head', 'dependent'] as const) {
    const token = arc.edge[end], other = arc.edge[end === 'head' ? 'dependent' : 'head'];
    const list = ports.get(token) ?? [];
    list.push({ arc, end, other }); ports.set(token, list);
  }
  // Incoming and outgoing paths share one ordered set of distinct ports. Focus never changes them.
  for (const [token, list] of ports) {
    const box = boxes[token]!, inset = Math.min(8, box.width / 4);
    list.sort((a, b) => a.other - b.other || a.arc.edge.dependent - b.arc.edge.dependent);
    list.forEach(({ arc, end }, index) => {
      arc[end] = list.length === 1 ? box.x + box.width / 2
        : box.x + inset + (box.width - 2 * inset) * index / (list.length - 1);
    });
  }
  const arcs = attached.sort((a, b) => Math.abs(a.edge.head - a.edge.dependent) - Math.abs(b.edge.head - b.edge.dependent))
    .map(({ edge, head, dependent }) => {
      const left = Math.min(head, dependent), right = Math.max(head, dependent);
      const labelWidth = (edge.name.length * 13 + 12) * scale;
      const labelLeft = Math.max(0, (left + right - labelWidth) / 2);
      const occupied = { left: Math.min(left, labelLeft) - 8, right: Math.max(right, labelLeft + labelWidth) + 8 };
      let lane = lanes.findIndex(spans => spans.every(s => occupied.right < s.left || occupied.left > s.right));
      if (lane < 0) { lane = lanes.length; lanes.push([]); }
      lanes[lane]!.push(occupied);
      return { edge, head, dependent, left, right, labelWidth, labelLeft, rise: (32 + lane * 38) * scale };
    });
  const height = (lanes.length ? 32 + (lanes.length - 1) * 38 : 0) * scale + 32 * scale + 16;
  return <View style={{ height }} pointerEvents="none" accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
    {arcs.map(({ edge, head, dependent, left, right, labelWidth, labelLeft, rise }) => {
      const focused = selected === null || edge.head === selected || edge.dependent === selected;
      const color = focused ? c.link : c.secondary, opacity = focused ? 1 : 0.3;
      const width = right - left + 16, arcHeight = rise + 16, top = height - arcHeight;
      const start = dependent - left + 8, end = head - left + 8, bottom = rise + 8;
      const angle = Math.atan2(2 * rise, (end - start) / 2), size = 7;
      const tip = (turn: number) => `${end - size * Math.cos(angle + turn)},${bottom - size * Math.sin(angle + turn)}`;
      // Only measured numbers and app palette colors enter SVG, never package text.
      const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${arcHeight}" viewBox="0 0 ${width} ${arcHeight}"><path d="M ${start} ${bottom} Q ${(start + end) / 2} ${8 - rise} ${end} ${bottom}" fill="none" stroke="${color}" stroke-width="${focused && selected !== null ? 2.5 : 1.5}"/><path d="M ${tip(-0.5)} L ${end} ${bottom} L ${tip(0.5)}" fill="none" stroke="${color}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
      return <View key={edge.dependent} style={{ position: 'absolute', inset: 0 }}>
        <Image accessible={false} source={{ uri: `data:image/svg+xml,${encodeURIComponent(svg)}` }}
          contentFit="fill" cachePolicy="none" transition={0}
          style={{ position: 'absolute', left: left - 8, top, width, height: arcHeight, opacity }} />
        <View style={{ position: 'absolute', left: labelLeft, top: top - 20 * scale,
          width: labelWidth, alignItems: 'center', opacity }}>
          <Label size={12} color={color}>{edge.name}</Label>
        </View>
      </View>;
    })}
  </View>;
}
