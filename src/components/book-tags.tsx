import { View } from 'react-native';
import { minimumBookXp, sampleLibraryEntry } from '@/core/library-presentation';
import { Badge } from './ui';

/** Shared by the owned library card and the selected book's stage summary. */
export function BookTags({ sentences, overlay = false, size = 13 }: { sentences: number; overlay?: boolean; size?: number }) {
  const minimumXp = minimumBookXp(sentences);
  const tagStyle = overlay ? { alignSelf: 'flex-end', maxWidth: '100%' } as const : undefined;
  return <View pointerEvents={overlay ? 'none' : 'auto'} style={overlay
    ? { position: 'absolute', top: 8, right: 8, left: 8, alignItems: 'flex-end', gap: 6 }
    : { flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
    <View style={tagStyle}><Badge icon="book.closed" tone="blue" size={size}>{sampleLibraryEntry().badge}</Badge></View>
    {minimumXp !== null && <View style={tagStyle} accessible accessibilityLabel={`전체 16스테이지를 각 3회 학습하면 최소 ${minimumXp.toLocaleString('ko-KR')} XP, 추가 사이클 제외`}>
      <Badge tone="green" size={size}>{minimumXp.toLocaleString('en-US')} XP +</Badge>
    </View>}
  </View>;
}
