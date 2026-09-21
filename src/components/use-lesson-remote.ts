import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Alert, AppState } from 'react-native';
import { useNavigation } from 'expo-router';
import { useIsFocused } from 'expo-router/react-navigation';
import { randomUUID } from 'expo-crypto';
import audio from '../../modules/learning-audio';
import type { Session } from '@/core/session';
import { lessonRemoteSnapshot, takeLessonRemoteAction } from '@/core/lesson-remote';
import { learningMonitor } from '@/native/voice-monitor';

/** The mounted lesson owns transport; only its visible, ready footer can act. */
export function useLessonRemote(state: Session | null, error: 'audio' | 'save' | null,
  ready: boolean, monitorKey: string | undefined, onMain: () => void, onRepeat: () => void) {
  const [owner] = useState(randomUUID);
  const focused = useIsFocused();
  const navigation = useNavigation();
  const [foreground, setForeground] = useState(AppState.currentState === 'active');
  const snapshot = lessonRemoteSnapshot(state, error, ready && focused && foreground);
  const current = useRef({ owner, revision: '', actionable: false, repeatable: false, onMain, onRepeat });
  const sequence = useRef(0);
  const started = useRef<Promise<void> | null>(null);
  const alive = useRef(false);
  const enabled = !!state && state.phase !== 'complete';

  useLayoutEffect(() => { current.current.onMain = onMain; current.current.onRepeat = onRepeat; });
  useEffect(() => {
    const subscription = AppState.addEventListener('change', value => {
      // Reject already queued bridge events before React renders the new gate.
      current.current.actionable = false;
      current.current.repeatable = false;
      setForeground(value === 'active');
    });
    const unsubscribe = navigation.addListener('blur', () => {
      current.current.actionable = false; current.current.repeatable = false;
    });
    return () => { subscription.remove(); unsubscribe(); };
  }, [navigation]);

  useEffect(() => {
    if (!audio?.beginLessonRemote || !enabled) return;
    let cancelled = false;
    alive.current = true;
    const subscription = audio.addListener('onLessonRemotePress', event => {
      const latest = current.current;
      if (!alive.current || AppState.currentState !== 'active' || !navigation.isFocused()) return;
      const action = takeLessonRemoteAction(latest, event);
      if (action === 'main') latest.onMain();
      else if (action === 'repeat') latest.onRepeat();
    });
    started.current = (async () => {
      await learningMonitor(monitorKey)?.open();
      if (!cancelled) await audio.beginLessonRemote(owner);
    })();
    void started.current.catch(() => {
      if (!cancelled) Alert.alert('이어폰 버튼 연결 실패', '화면의 버튼을 사용하거나 학습을 다시 열어 주세요.');
    });
    const close = () => {
      cancelled = true; alive.current = false; current.current.actionable = false; current.current.repeatable = false;
      void audio!.endLessonRemote(owner).catch(() => {});
    };
    const unsubscribe = navigation.addListener('beforeRemove', close);
    return () => { close(); unsubscribe(); subscription.remove(); started.current = null; };
  }, [owner, enabled, monitorKey, navigation]);

  useLayoutEffect(() => {
    current.current.revision = String(++sequence.current);
    current.current.actionable = snapshot.actionable;
    current.current.repeatable = snapshot.repeatable;
  }, [owner, enabled, monitorKey, snapshot.revision, snapshot.actionable, snapshot.repeatable]);

  useEffect(() => {
    if (!audio?.activateLessonRemote || !enabled || !focused || !foreground) return;
    let cancelled = false;
    // Returning from a menu/another app reclaims transport, not playback or mic.
    void started.current?.then(() => {
      if (!cancelled && alive.current) return audio!.activateLessonRemote(owner);
    }).catch(() => { current.current.actionable = false; current.current.repeatable = false; });
    return () => { cancelled = true; };
  }, [owner, enabled, monitorKey, focused, foreground]);

  useEffect(() => {
    if (!audio?.updateLessonRemote || !enabled) return;
    let cancelled = false;
    const revision = current.current.revision;
    void started.current?.then(() => {
      if (cancelled || !alive.current) return;
      if (audio!.updateLessonRemoteActions) return audio!.updateLessonRemoteActions(owner, revision,
        snapshot.actionable, snapshot.repeatable, snapshot.playing);
      return audio!.updateLessonRemote(owner, revision, snapshot.actionable, snapshot.playing);
    }).catch(() => { current.current.actionable = false; current.current.repeatable = false; });
    return () => { cancelled = true; };
  }, [owner, enabled, monitorKey, snapshot.revision, snapshot.actionable, snapshot.repeatable, snapshot.playing]);
}
