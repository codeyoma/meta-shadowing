import { View } from 'react-native';
import { minimumBookXp, sampleLibraryEntry } from '@/core/library-presentation';
import { Badge } from './ui';

/** Shared by the owned library card and the selected book's stage summary. */
export function BookTags({ sentences }: { sentences: number }) {
  const minimumXp = minimumBookXp(sentences);
  return <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
    <Badge icon="book.closed" tone="blue">{sampleLibraryEntry().badge}</Badge>
    {minimumXp !== null && <View accessible accessibilityLabel={`전체 16스테이지를 각 3회 학습하면 최소 ${minimumXp.toLocaleString('ko-KR')} XP, 추가 사이클 제외`}>
      <Badge tone="green">{minimumXp.toLocaleString('en-US')} XP +</Badge>
    </View>}
  </View>;
}
