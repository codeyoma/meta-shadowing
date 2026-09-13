import { useEffect, useState } from 'react';
import { Alert, View } from 'react-native';
import delivery, { type DiagnosticStatus } from '../../modules/package-delivery';
import { ActionButton, Label } from './ui';
import { HostedDownloadCard } from './hosted-download-card';

export function DeliveryDiagnostics() {
  const [visible, setVisible] = useState(false);
  if (!delivery.diagnosticsEnabled) return null;
  return visible ? <DiagnosticPanel /> : <ActionButton title="내부 다운로드 진단" secondary onPress={() => setVisible(true)} />;
}

function DiagnosticPanel() {
  const [status, setStatus] = useState<DiagnosticStatus | null>(null);
  const [acting, setActing] = useState(false);
  useEffect(() => {
    let active = true;
    let timer: ReturnType<typeof setTimeout>;
    async function poll() {
      try { const value = await delivery.diagnosticStatus(); if (active) setStatus(value); }
      catch { if (active) setStatus(null); }
      if (active) timer = setTimeout(poll, 250);
    }
    void poll();
    return () => { active = false; clearTimeout(timer); };
  }, []);
  async function run(action: () => Promise<void>) {
    setActing(true);
    try { await action(); }
    catch {
      const value = await delivery.diagnosticStatus().catch(() => null);
      if (value?.phase !== 'cancelled') Alert.alert('진단 작업을 완료하지 못했어요', 'Wi-Fi 연결과 상태를 확인해 주세요. 기존 학습 데이터는 변경하지 않아요.');
    } finally {
      setStatus(await delivery.diagnosticStatus().catch(() => null));
      setActing(false);
    }
  }
  const busy = acting || !status || ['downloading', 'installing', 'cancelling'].includes(status.phase);
  const outcome = status?.outcome;
  return <View style={{ gap: 12 }}>
    <Label size={22} weight="800">내부 다운로드 진단</Label>
    <Label size={13} muted>Wi-Fi에서 실행하세요. 약 32 MB의 별도 테스트 팩만 사용하며 학습 기록·기존 음원·백업은 변경하지 않아요.</Label>
    <HostedDownloadCard book={{ title: '진단 전용 팩', sentences: 12, chapters: null, owned: true }}
      completed={null} status={status} blocked={acting}
      download={() => { void run(() => delivery.diagnosticStart(false)); }}
      cancel={() => { void delivery.diagnosticCancel().catch(() => Alert.alert('취소하지 못했어요')); }}
      open={() => Alert.alert('파일 검증 완료', '진단 팩은 학습 기록을 만들지 않아요. 실제 학습은 기존 Apple-hosted 샘플에서 확인하세요.')} />
    <Label size={13}>진단 상태: {status?.phase ?? '확인 중'}</Label>
    <Label size={13}>{outcome === 'cancelled-unpublished' ? `중간 진행 ${Math.round((status?.observedProgress ?? 0) * 100)}%에서 취소 요청 · 설치되지 않음`
      : outcome === 'inconclusive' ? '취소 판정 불가: 다운로드가 먼저 완료되었거나 캐시가 남아 있어요.'
        : outcome === 'observing' ? '실제 다운로드 중간 진행을 기다리는 중…'
          : outcome === 'failed' ? '취소 시험 실패: 연결 및 다운로드 상태를 확인하세요.' : '취소 시험: 아직 실행하지 않음'}</Label>
    <ActionButton title="중간 취소 시험" disabled={busy || status?.phase === 'ready'} onPress={() => { void run(() => delivery.diagnosticStart(true)); }} secondary />
    <ActionButton title="진단 음원 누락 만들기" disabled={busy || status?.phase !== 'ready'} onPress={() => { void run(() => delivery.diagnosticDamage('missing')); }} secondary />
    <ActionButton title="진단 음원 손상 만들기" disabled={busy || status?.phase !== 'ready'} onPress={() => { void run(() => delivery.diagnosticDamage('corrupt')); }} secondary />
    <Label size={13} muted>누락·손상 뒤 위 카드에 ‘다운로드’가 표시되면 눌러 복구하세요.</Label>
    <ActionButton title="진단 팩만 초기화" disabled={busy} onPress={() => { void run(() => delivery.diagnosticReset()); }} secondary />
  </View>;
}
