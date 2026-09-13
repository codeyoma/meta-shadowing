import { View } from 'react-native';
import type { DeliveryStatus } from '../../modules/package-delivery';
import { BookCard } from './book-card';
import { ActionButton, Label, ProgressTrack } from './ui';

// Both the library and the isolated diagnostic installation use this recovery UI.
export function HostedDownloadCard({ book, completed, status, download, cancel, open, blocked = false }: {
  book: { title: string; sentences: number; chapters: number | null; owned: boolean };
  completed: number | null; status: DeliveryStatus | null;
  download(): void; cancel(): void; open(): void; blocked?: boolean;
}) {
  const phase = status?.phase;
  const busy = !!status && ['downloading', 'installing', 'cancelling'].includes(status.phase);
  const label = !status ? '확인 중' : phase === 'unavailable' ? '준비 중'
    : phase === 'downloading' ? `${Math.floor(status.progress * 100)}%`
      : phase === 'installing' ? '검증 중' : phase === 'cancelling' ? '취소 중' : blocked ? '확인 중' : undefined;
  return <View style={{ gap: 10 }}>
    <BookCard title={book.title} sentences={book.sentences} chapters={book.chapters}
      completed={completed} owned={book.owned} installed={phase === 'ready'} busy={label}
      onPress={phase === 'ready' ? open : download} />
    {busy && <ProgressTrack value={status.progress} total={1} label="Apple 레슨 다운로드 진행" blue />}
    {phase === 'downloading' && <ActionButton title="다운로드 취소" onPress={cancel} secondary />}
    {phase === 'unavailable' && <Label size={13} muted>이 빌드에는 Apple 다운로드 설정이 없어요. 설정된 TestFlight 빌드에서 사용할 수 있어요.</Label>}
    {phase === 'failed' && <Label size={13} muted>다운로드 또는 파일 검증을 완료하지 못했어요. 다시 다운로드해 주세요.</Label>}
  </View>;
}
