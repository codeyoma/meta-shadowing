import { useEffect, useRef, useState } from 'react';
import { Alert, AppState } from 'react-native';
import { useNavigation } from 'expo-router';
import { useNavigationState } from 'expo-router/react-navigation';
import { randomUUID } from 'expo-crypto';
import type { MonitorStatus, VoiceMonitorLab } from '@/core/voice-monitor-lab';
import { createLearningMonitor, learningMonitorSupported, monitorNative } from '@/native/voice-monitor';

/** Own capture for the mounted lesson, not its transient focus/menu state. */
export function useLearningMonitor(scope: string, complete: boolean, blocked: boolean, ready: boolean) {
  const [routeKey] = useState(randomUUID);
  const key = `${routeKey}:${scope}`;
  const state = useNavigationState(state => state);
  const navigation = useNavigation();
  const session = useRef<VoiceMonitorLab | null>(null);
  const latest = useRef({ state, complete, blocked, ready });
  latest.current = { state, complete, blocked, ready };
  const updateAutomatic = useRef<(() => void) | null>(null);
  useEffect(() => {
    if (!learningMonitorSupported || !monitorNative) return;
    const current = createLearningMonitor(key);
    session.current = current;
    let alive = true, revision = 0;
    let status: MonitorStatus | undefined;
    let foreground = AppState.currentState === 'active';
    const update = () => {
      if (!alive || !status) return;
      const { complete, blocked, ready } = latest.current;
      void current.automaticChanged(status, { foreground, eligible: ready && !complete && !blocked })
        .catch(() => { if (alive) Alert.alert('마이크 준비 실패', '내 목소리 듣기 메뉴에서 다시 켜 주세요.'); });
    };
    updateAutomatic.current = update;
    const refresh = async () => {
      const epoch = ++revision;
      try {
        const next = await monitorNative!.monitorStatus();
        if (alive && epoch === revision) { status = next; update(); }
      } catch { /* The native status event or next foreground refresh can recover. */ }
    };
    const changes = monitorNative.addListener('onMonitorStatus', next => {
      ++revision;
      if (alive) { status = next; update(); }
    });
    const app = AppState.addEventListener('change', next => {
      foreground = next === 'active';
      // Never start from a stale route snapshot on returning to the app.
      if (foreground) void refresh(); else update();
    });
    void current.open().catch(() => Alert.alert('오디오 준비 실패', '학습을 나갔다가 다시 열어 주세요.'));
    void refresh();
    const close = () => { void current.close().catch(() => Alert.alert('오디오 종료 실패', '앱을 닫아 모니터링을 종료해 주세요.')); };
    const unsubscribe = navigation.addListener('beforeRemove', close);
    return () => {
      alive = false; updateAutomatic.current = null;
      changes.remove(); app.remove(); unsubscribe(); close();
    };
  }, [key, navigation]);
  useEffect(() => {
    const current = session.current;
    if (!current) return;
    void current.learningChanged(state, { blocked, complete })
      .then(() => updateAutomatic.current?.())
      .catch(() => Alert.alert('오디오 종료 실패', '앱을 닫아 모니터링을 종료해 주세요.'));
  }, [state, complete, blocked, ready, key]);
  return learningMonitorSupported ? key : undefined;
}
