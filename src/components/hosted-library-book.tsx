import { useCallback, useEffect, useState } from 'react';
import { Alert, AppState, View } from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import type { books } from '@/native/catalog';
import { cancelHostedSample, downloadHostedSample, hostedStatus } from '@/native/hosted-package';
import type { DeliveryStatus } from '../../modules/package-delivery';
import { useLibrary } from './library-context';
import { useBookRecords } from './use-book-records';
import { BookCard } from './book-card';
import { ActionButton, Label, ProgressTrack } from './ui';

export function HostedLibraryBook({ book }: { book: typeof books[number] }) {
  const { select } = useLibrary();
  const { overview } = useBookRecords(book);
  const [status, setStatus] = useState<DeliveryStatus | null>(null);
  const refresh = useCallback(async () => {
    try { setStatus(await hostedStatus()); }
    catch { setStatus({ phase: 'failed', progress: 0 }); }
  }, []);
  useFocusEffect(useCallback(() => { void refresh(); }, [refresh]));
  const busy = !!status && ['downloading', 'installing', 'cancelling'].includes(status.phase);
  useEffect(() => {
    if (!busy) return;
    let active = true;
    let timer: ReturnType<typeof setTimeout>;
    async function poll() {
      try { const next = await hostedStatus(); if (active) setStatus(next); }
      catch { /* The active action reports failures; a transient poll isn't terminal. */ }
      if (active) timer = setTimeout(poll, 250);
    }
    void poll();
    return () => { active = false; clearTimeout(timer); };
  }, [busy]);
  useEffect(() => {
    const subscription = AppState.addEventListener('change', state => { if (state === 'active') void refresh(); });
    return () => subscription.remove();
  }, [refresh]);
  async function download() {
    setStatus({ phase: 'downloading', progress: 0 });
    try { await downloadHostedSample(); }
    catch {
      const current = await hostedStatus().catch(() => null);
      if (current?.phase !== 'cancelled') Alert.alert('다운로드하지 못했어요', '연결과 저장 공간을 확인하고 다시 다운로드해 주세요. 검증을 마치기 전에는 학습을 시작할 수 없어요.');
    } finally { await refresh(); }
  }
  async function cancel() {
    try { await cancelHostedSample(); await refresh(); }
    catch { Alert.alert('취소하지 못했어요', '다시 시도해 주세요.'); }
  }
  const phase = status?.phase;
  const label = !status ? '확인 중' : phase === 'unavailable' ? '준비 중'
    : phase === 'downloading' ? `${Math.floor(status.progress * 100)}%`
      : phase === 'installing' ? '검증 중' : phase === 'cancelling' ? '취소 중' : undefined;
  return <View style={{ gap: 10 }}>
    <BookCard title={book.title} sentences={book.sentences} chapters={book.chapters}
      completed={overview?.completed ?? null} owned={book.owned} installed={phase === 'ready'} busy={label}
      onPress={() => {
        if (phase === 'ready') {
          if (select({ language: book.language, book: book.id, packageKey: book.packageKey })) router.navigate('/lesson');
        } else void download();
      }} />
    {busy && <ProgressTrack value={status.progress} total={1} label="Apple 레슨 다운로드 진행" blue />}
    {phase === 'downloading' && <ActionButton title="다운로드 취소" onPress={() => { void cancel(); }} secondary />}
    {phase === 'unavailable' && <Label size={13} muted>이 빌드에는 Apple 다운로드 설정이 없어요. 설정된 TestFlight 빌드에서 사용할 수 있어요.</Label>}
    {phase === 'failed' && <Label size={13} muted>다운로드 또는 파일 검증을 완료하지 못했어요. 다시 다운로드해 주세요.</Label>}
  </View>;
}
