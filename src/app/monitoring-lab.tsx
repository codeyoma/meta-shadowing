import { useEffect, useRef, useState } from 'react';
import { AppState, Linking, ScrollView, Switch, View } from 'react-native';
import { useNavigation } from 'expo-router';
import { useNavigationState } from 'expo-router/react-navigation';
import Slider from '@react-native-community/slider';
import { ActionButton as Button, Label, usePalette } from '@/components/ui';
import { monitorPresentation, type MonitorStatus, type VoiceMonitorLab } from '@/core/voice-monitor-lab';
import { createMonitorLab, monitorNative, prepareMonitorSample } from '@/native/voice-monitor';

export default function MonitoringLab() {
  const navigation = useNavigation();
  // Subscribe to the actual stack, not Expo's non-reactive __root snapshot.
  const navigationState = useNavigationState(state => state);
  const c = usePalette();
  const [status, setStatus] = useState<MonitorStatus>({ state: 'off', input: null, output: 'none', gain: 0.25,
    sampleRate: null, bufferSeconds: null, inputLatencySeconds: null, outputLatencySeconds: null });
  const [error, setError] = useState('');
  const [ready, setReady] = useState(false);
  const [sampleURI, setSampleURI] = useState<string>();
  const lab = useRef<VoiceMonitorLab | null>(null);
  const view = monitorPresentation(__DEV__, status.state, status.output);

  // A temporary overlay/menu must not relinquish the native audio session.
  // Actual screen removal still closes the lab and stops monitoring.
  useEffect(() => {
    if (!__DEV__ || !monitorNative) return;
    let alive = true;
    const current = createMonitorLab();
    lab.current = current;
    const stopOnExit = navigation.addListener('beforeRemove', () => {
      void current.close().catch(() => { if (alive) setError('오디오를 종료하지 못했어요. 앱을 닫아 주세요.'); });
    });
    setReady(false);
    const subscription = monitorNative.addListener('onMonitorStatus', next => { if (alive) setStatus(next); });
    const state = AppState.addEventListener('change', next => {
      if (next === 'active') void monitorNative!.monitorStatus()
        .then(next => { if (alive) setStatus(next); })
        .catch(() => { if (alive) setError('연결 상태를 확인하지 못했어요. 오디오 복구 후 다시 시도해 주세요.'); });
    });
    void (async () => {
      try {
        await current.open();
        const uri = await prepareMonitorSample();
        const initial = await monitorNative!.monitorStatus();
        if (alive) { setSampleURI(uri); setStatus(initial); setReady(true); }
      } catch { if (alive) setError('테스트 준비에 실패했어요. 오디오 복구 후 화면을 다시 열어 주세요.'); }
    })();
    return () => {
      alive = false;
      subscription.remove(); state.remove(); stopOnExit();
      void current.close().catch(() => { /* Retry is available on the next lab entry. */ });
    };
  }, [navigation]);

  useEffect(() => {
    void lab.current?.navigationChanged(navigationState)
      .catch(() => setError('오디오를 종료하지 못했어요. 앱을 닫아 주세요.'));
  }, [navigationState]);

  async function action(work: () => Promise<unknown>) {
    setError('');
    try { await work(); if (monitorNative) setStatus(await monitorNative.monitorStatus()); }
    catch { setError('오디오 작업에 실패했어요. 연결 확인 또는 오디오 복구 후 다시 시도해 주세요.'); }
  }
  const ms = (value: number | null) => value === null ? '—' : `${(value * 1000).toFixed(1)} ms`;

  return <ScrollView contentInsetAdjustmentBehavior="automatic" contentContainerStyle={{ padding: 20, gap: 22 }}>
    {!view.available ? <Label>{view.message}</Label> : <>
      <Label>유선 이어폰 실험 · 개발 전용</Label>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
        <Label>내 목소리 듣기</Label>
        <Switch accessibilityLabel="내 목소리 듣기" value={status.state === 'monitoring'}
          disabled={!ready || !view.canEnable}
          onValueChange={on => void action(() => on ? lab.current!.enable() : lab.current!.disable())} />
      </View>
      <Label>{view.message}</Label>
      <Label>켜 둔 동안 메뉴·다른 앱·화면 잠금에서도 계속 들려요. 종료하려면 스위치를 꺼 주세요.</Label>
      {status.state === 'denied' && <Button title="앱 설정 열기" onPress={() => void Linking.openSettings()} />}
      <Label>출력: {status.output === 'headphones' ? '유선 이어폰' : status.output === 'none' ? '연결 없음' : '지원하지 않는 출력'}</Label>
      <Label>마이크: {status.input === 'headset' ? '이어폰' : status.input === 'builtIn' ? 'iPhone' : '꺼짐'}</Label>
      <View style={{ gap: 8 }}>
        <Label>내 목소리 음량 · {Math.round(status.gain * 100)}%</Label>
        <Label>목소리 4배 증폭 · 휴대폰 음량을 낮춰 시작하세요.</Label>
        <Slider accessibilityLabel="내 목소리 음량" accessibilityValue={{ min: 0, max: 100, now: Math.round(status.gain * 100) }}
          minimumValue={0} maximumValue={1} step={0.05} value={status.gain} disabled={!ready}
          onSlidingComplete={value => void action(() => monitorNative!.setMonitorGain(value))}
          minimumTrackTintColor={c.accent} style={{ height: 44 }} />
      </View>
      <Button title="샘플 음성 재생" disabled={!view.canPlay || !sampleURI}
        onPress={() => void action(() => monitorNative!.playMonitorSample(sampleURI!))} />
      <Button title="샘플 음성 중지" disabled={!view.canPlay} onPress={() => void action(() => monitorNative!.stopMonitorSample())} />
      <View style={{ gap: 6 }}>
        <Label>샘플레이트: {status.sampleRate ?? '—'} Hz</Label>
        <Label>I/O 버퍼: {ms(status.bufferSeconds)}</Label>
        <Label>입력 지연: {ms(status.inputLatencySeconds)}</Label>
        <Label>출력 지연: {ms(status.outputLatencySeconds)}</Label>
        <Label>버퍼 설정값은 실제 왕복 지연이 아니에요.</Label>
      </View>
      {!!error && <Label>{error}</Label>}
      <Button title="오디오 복구 · 모니터링 종료" onPress={() => void action(async () => { await lab.current?.close(); setReady(false); })} />
    </>}
  </ScrollView>;
}
