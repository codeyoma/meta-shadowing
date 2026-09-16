import { useCallback, useRef, useState } from 'react';
import { AppState, ScrollView, View } from 'react-native';
import { Stack, useFocusEffect } from 'expo-router';
import type { DeliveryStatus } from '../../modules/package-delivery';
import { hostedDownloadPresentation } from '@/core/library-presentation';
import { OwnedLibraryBookCard } from './owned-library-book-card';
import { ActionButton, Label } from './ui';

/** Isolated animation playground: never invokes delivery, storage or learning APIs. */
export function DownloadPreview() {
  const [status, setStatus] = useState<DeliveryStatus>({ phase: 'idle', progress: 0 });
  const [editing, setEditing] = useState(false);
  const [failed, setFailed] = useState(false);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);
  const finish = useRef<ReturnType<typeof setTimeout> | null>(null);
  const stop = useCallback(() => {
    if (timer.current) clearInterval(timer.current);
    if (finish.current) clearTimeout(finish.current);
    timer.current = null;
    finish.current = null;
  }, []);
  useFocusEffect(useCallback(() => {
    const subscription = AppState.addEventListener('change', state => {
      if (state !== 'active') { stop(); setStatus({ phase: 'idle', progress: 0 }); }
    });
    return () => { stop(); subscription.remove(); };
  }, [stop]));
  function start() {
    stop(); setFailed(false); setEditing(false);
    setStatus({ phase: 'downloading', progress: 0 });
    const started = Date.now();
    // Match real delivery polling; Reanimated interpolates between samples on the UI thread.
    timer.current = setInterval(() => {
      const progress = Math.min(1, (Date.now() - started) / 10000);
      if (progress < 1) setStatus({ phase: 'downloading', progress });
      else {
        stop(); setStatus({ phase: 'installing', progress: 1 });
        finish.current = setTimeout(() => setStatus({ phase: 'ready', progress: 1 }), 800);
      }
    }, 250);
  }
  function reset() {
    stop(); setStatus({ phase: 'idle', progress: 0 }); setFailed(false); setEditing(false);
  }
  const download = hostedDownloadPresentation(status);
  return <ScrollView contentInsetAdjustmentBehavior="automatic" contentContainerStyle={{ padding: 24, gap: 20 }}>
    <Stack.Screen options={{ title: '다운로드 미리보기 · 10초' }} />
    <Label size={14} muted>개발용 미리보기예요. 실제 다운로드나 학습 기록은 바뀌지 않아요.</Label>
    <OwnedLibraryBookCard title="Morning Notes · Apple-hosted" sentences={12} chapters={null} completed={0}
      installed={status.phase === 'ready'} editing={editing} busy={!!download} download={download}
      storage={{ bytes: status.phase === 'ready' ? 1024 : 0, installed: status.phase === 'ready', busy: !!download }}
      storageFailed={failed} onRetryStorage={() => setFailed(false)} onStudy={() => {}}
      onDownload={start} onRemove={() => setStatus({ phase: 'idle', progress: 0 })}
      onCancel={() => {
        stop(); setStatus({ phase: 'cancelling', progress: status.progress });
        finish.current = setTimeout(() => setStatus({ phase: 'cancelled', progress: 0 }), 600);
      }} />
    <View style={{ gap: 10 }}>
      <ActionButton title="처음 상태로" secondary onPress={reset} />
      <ActionButton title={editing ? '편집 완료' : '편집 상태 보기'} secondary onPress={() => setEditing(!editing)} />
      <ActionButton title="저장 확인 오류 보기" secondary disabled={!!download} onPress={() => setFailed(true)} />
    </View>
  </ScrollView>;
}
