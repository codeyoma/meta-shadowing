import { Alert, View } from 'react-native';
import { Image } from 'expo-image';
import type { SFSymbol } from 'sf-symbols-typescript';
import { canRetryStorageRead, materialActions, sampleLibraryEntry } from '@/core/library-presentation';
import { FeedbackPressable as Pressable } from './feedback-pressable';
import { Badge, Card, Icon, Label, ProgressTrack, usePalette } from './ui';

function IconControl({ title, icon, disabled, tone = 'primary', onPress }: {
  title: string; icon: SFSymbol; disabled: boolean; tone?: 'primary' | 'macaw' | 'cardinal'; onPress(): void;
}) {
  const c = usePalette();
  const ink = disabled ? c.secondary : tone === 'cardinal' ? '#1b1b1b' : c.onAccent;
  return <Pressable accessibilityRole="button" accessibilityLabel={title}
    accessibilityState={{ disabled }} disabled={disabled} onPress={onPress}
    style={({ pressed }) => ({ minWidth: 64, minHeight: 54, paddingHorizontal: 12, paddingVertical: 8,
      borderRadius: 14, borderCurve: 'continuous', flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
      backgroundColor: disabled ? c.disabled : tone === 'macaw' ? c.blue : tone === 'cardinal' ? c.red : c.accent,
      opacity: pressed ? 0.65 : 1 })}>
    <Icon name={icon} size={21} color={ink} />
    <Label size={16} weight="700" color={ink}>{title}</Label>
  </Pressable>;
}

export function OwnedLibraryBookCard({ title, sentences, chapters, completed, editing, installed, busy,
  busyLabel, storage, storageFailed, cacheRetry, hosted, onStudy, onDownload, onCancel, onRemove, onRetryStorage }: {
  title: string; sentences: number; chapters: number | null; completed: number | null; editing: boolean;
  installed: boolean; busy: boolean; busyLabel?: string;
  storage: { bytes: number; installed: boolean; busy: boolean } | null; storageFailed: boolean;
  cacheRetry: boolean; hosted: boolean; onStudy(): void; onDownload(): void; onCancel?(): void; onRemove(): void;
  onRetryStorage(): void;
}) {
  const c = usePalette();
  const verifiedInstalled = storageFailed ? false : storage?.installed ?? installed;
  const actions = materialActions({ installed: verifiedInstalled, busy: busy || !!storage?.busy,
    editing, bytes: storage?.bytes, hosted, readFailed: storageFailed });
  const cacheOnly = hosted && !!storage && !storage.installed && storage.bytes === 0;
  const removalTitle = cacheOnly ? (cacheRetry ? 'Apple 캐시 정리 다시 시도' : 'Apple 캐시 정리') : '학습 자료 삭제';
  return <View style={{ gap: 10 }}>
    <Card style={{ padding: 14, gap: 14 }}>
      <View style={{ flexDirection: 'row', gap: 12 }}>
        <Image source={require('../../assets/illustrations/morning-notes.png')} accessible={false}
          contentFit="cover" style={{ width: 70, height: 94, borderRadius: 12 }} />
        <View style={{ flex: 1, gap: 6 }}>
          <Badge icon="book.closed" tone="blue">{sampleLibraryEntry().badge}</Badge>
          <Label size={19} display color={c.heading}>{title}</Label>
          <Label size={13} muted>총 {sentences}문장 / 챕터 {chapters === null ? '—' : chapters + '개'}</Label>
          <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: 8 }}>
            <View style={{ flex: 1 }}><ProgressTrack label="도서 스테이지 진행" value={completed ?? 0} total={16} /></View>
            <Label size={12} weight="700" color={c.heading}>{completed ?? '—'}/16</Label>
          </View>
        </View>
      </View>
      {busyLabel && <Label size={13} weight="700">{busyLabel}</Label>}
      {storageFailed && <>
        <Label size={13} color={c.danger}>저장 정보를 확인하지 못했어요. 다시 시도해 주세요.</Label>
        <IconControl title="저장 정보 다시 확인" icon="arrow.clockwise"
          disabled={!canRetryStorageRead(storageFailed, busy || !!storage?.busy)} onPress={onRetryStorage} />
      </>}
      {!editing && (actions.primaryAction === 'study'
        ? <IconControl title="학습하기" icon="play.fill" disabled={!actions.canStudy} onPress={onStudy} />
        : <IconControl title="다운로드" icon="square.and.arrow.down" tone="macaw"
          disabled={!actions.canDownload} onPress={onDownload} />)}
      {onCancel && <IconControl title="다운로드 취소" icon="xmark.circle.fill" disabled={false} onPress={onCancel} />}
      {editing && <View style={{ gap: 8 }}>
        {cacheRetry && <Label size={13} color={c.danger}>Apple 캐시 정리를 다시 시도해 주세요.</Label>}
        <IconControl title={removalTitle} icon="trash" tone="cardinal" disabled={!actions.canRemove} onPress={() => Alert.alert(
          '"' + title + (cacheOnly ? '" Apple 캐시 정리를 요청할까요?' : '" 학습 자료를 삭제할까요?'),
          cacheOnly ? '남아 있는 캐시 정리를 요청해요. 학습 기록은 유지돼요.'
            : '다운로드한 자료만 삭제하며, 학습 기록은 유지돼요.', [
            { text: '취소', style: 'cancel' }, { text: cacheOnly ? '정리 요청' : '삭제', style: 'destructive', onPress: onRemove },
          ])} />
      </View>}
    </Card>
  </View>;
}
