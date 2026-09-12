import { useCallback, useRef, useState } from 'react';
import { Alert, AppState, ScrollView, View } from 'react-native';
import { FeedbackPressable as Pressable } from '@/components/feedback-pressable';
import { Stack, router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { randomUUID } from 'expo-crypto';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated, { FadeIn, ReduceMotion } from 'react-native-reanimated';
import { ActionButton, Card, Icon, Label, usePalette } from '../components/ui';
import { Player } from '../core/player';
import { createSession, type Session } from '../core/session';
import { getJournal } from '../native/journal';
import { nativeAudio } from '../native/audio';
import { lesson, packageKey, isInstalled } from '../native/package';
import { readSettings } from '../native/settings';
import { sampleIdentity } from '@/native/catalog';
import { playableStage } from '@/core/catalog';
import { canOpenStage } from '@/core/stage-overview';
import { CycleTimeline } from '@/components/cycle-timeline';
import { PlayerControls } from '@/components/player-controls';
import { canOfferRepeat, mainPlayerAction } from '@/core/player-presentation';
import { methodNames } from '@/components/method-label';
import { PlayerHeaderProgress } from '@/components/player-header-progress';

const CONTENT_ENTER = FadeIn.duration(120).reduceMotion(ReduceMotion.System);

export default function PlayerScreen() {
  const { stage: param } = useLocalSearchParams<{ stage: string }>();
  const stage = playableStage(param);
  const c = usePalette();
  const insets = useSafeAreaInsets();
  const engine = useRef<Player | null>(null);
  const opened = useRef(false);
  const [state, setState] = useState<Session | null>(null);
  const [unavailable, setUnavailable] = useState(false);
  const [error, setError] = useState<'save' | 'audio' | null>(null);
  const [duration, setDuration] = useState(0);
  const [busy, setBusy] = useState(false);
  const acting = useRef(false);
  useFocusEffect(useCallback(() => {
    let active = true;
    let shown: string | null = null;
    let timer: ReturnType<typeof setInterval> | undefined;
    let appState: { remove(): void } | undefined;
    const initialize = async () => {
      try {
        if (stage === null) { if (active) setUnavailable(true); return; }
        if (!await isInstalled()) { if (active) setUnavailable(true); return; }
        if (!active) return;
        const journal = getJournal();
        if (!canOpenStage(stage, [{ stage: 1, count: journal.completions(packageKey, 1), session: null }])) {
          if (active) setUnavailable(true);
          return;
        }
        const saved = journal.load(packageKey, stage, lesson.phrases.length);
        const fresh = !saved || (saved.phase === 'complete' && !opened.current);
        const initial = !fresh && saved ? saved : createSession({ runId: randomUUID(), stage, phraseCount: lesson.phrases.length, ...readSettings() });
        const firstEntry = !opened.current;
        opened.current = true;
        const audio = nativeAudio(duration => engine.current?.audioEnded(duration), () => engine.current?.audioFailed(), () => engine.current?.pause());
        const player = new Player(initial, audio, s => journal.save(packageKey, s, sampleIdentity), () => performance.now(), () => {
          if (!active) return;
          setState({ ...player.state }); setError(player.error);
          const mediaDuration = audio.duration?.() ?? 0;
          if (mediaDuration > 0) setDuration(mediaDuration);
          if (player.error && player.error !== shown) {
            shown = player.error;
            Alert.alert(player.error === 'save' ? '학습을 저장하지 못했어요' : '음성을 재생할 수 없어요',
              player.error === 'save' ? '학습을 잠시 멈췄어요. 저장 공간을 확인하고 다시 시도해 주세요.' : '학습 위치는 유지됩니다. 다시 시도하거나 레슨을 재설치해 주세요.',
              [{ text: '나중에', style: 'cancel' }, { text: '다시 시도', onPress: () => {
                if (!active || engine.current !== player || AppState.currentState !== 'active') return;
                shown = null;
                if (player.error === 'save') player.retrySave();
                else if (player.error === 'audio') {
                  setBusy(true);
                  void player.resume().finally(() => { if (active) setBusy(false); });
                }
              } }]);
          }
          if (!player.error) shown = null;
        });
        engine.current = player;
        acting.current = false; setBusy(false);
        setState({ ...initial });
        timer = setInterval(() => { if (AppState.currentState === 'active') player.tick(); }, 100);
        appState = AppState.addEventListener('change', next => { if (next !== 'active') player.pause(); });
        if (firstEntry && AppState.currentState === 'active') {
          setBusy(true);
          await player.enter();
          if (active) setBusy(false);
        }
      } catch { if (active) { setUnavailable(true); Alert.alert('학습을 열 수 없어요', '기록을 초기화하지 않았어요. 저장 공간과 레슨 설치 상태를 확인해 주세요.'); } }
    };
    void initialize();
    return () => { active = false; if (timer) clearInterval(timer); appState?.remove(); engine.current?.dispose(); engine.current = null; };
  }, [stage]));
  const phrase = state ? lesson.phrases[state.phrase] : null;
  const leave = () => { engine.current?.pause(); if (engine.current?.error !== 'save') { if (router.canGoBack()) router.back(); else router.replace('/lesson'); } };
  const openOptions = () => {
    engine.current?.pause();
    if (stage && engine.current && engine.current.error !== 'save') router.push({ pathname: '/player-options', params: { stage } });
  };
  const openGuide = () => {
    engine.current?.pause();
    if (!stage || !engine.current || engine.current.error === 'save') return;
    const level = Math.ceil(stage / 2);
    // Guidance content is intentionally empty until supplied by the owner.
    Alert.alert(`메타쉐도잉 Lv ${level} · 학습 가이드`, methodNames[level - 1], [{ text: '닫기', style: 'cancel' }]);
  };
  async function act(repeat = false) {
    const player = engine.current;
    if (!player || acting.current) return;
    acting.current = true; setBusy(true);
    try {
      if (repeat) {
        if (canOfferRepeat(player.state, player.error)) await player.choose('repeat');
        return;
      }
      switch (mainPlayerAction(player.state, player.error)) {
        case 'resume': await player.resume(); break;
        case 'confirm':
          if (!player.state.running) await player.resume();
          await player.confirm(); break;
        case 'next': await player.choose('next'); break;
        case 'leave': leave(); break;
        case 'recover': player.retrySave(); if (!player.error) await player.resume(); break;
        case 'wait': break;
      }
    } finally { acting.current = false; setBusy(false); }
  }
  return <View style={{ flex: 1 }}>
    <Stack.Screen options={{ title: '학습', headerBackVisible: false,
      header: () => <PlayerHeaderProgress onOptions={openOptions} current={state ? state.phrase + 1 : 1}
        total={state?.phraseCount ?? lesson.phrases.length}
        completed={state ? state.phase === 'complete' ? state.phraseCount : state.phrase : 0} /> }} />
    <ScrollView contentInsetAdjustmentBehavior="automatic" contentContainerStyle={{ flexGrow: 1, padding: 24, gap: 20 }}>
      {unavailable ? <Card><Label>학습을 시작할 수 없어요.</Label><ActionButton title="레슨으로" onPress={leave} /></Card> : !state ? <Label muted>레슨을 여는 중…</Label> : <>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
          <Pressable accessibilityRole="button" accessibilityLabel={`메타쉐도잉 레벨 ${Math.ceil(state.stage / 2)}, 학습 가이드 열기`} onPress={openGuide}
            style={{ flex: 1, minHeight: 44, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7 }}>
            <Icon name="graduationcap.fill" /><Label size={14} weight="700">Lv {Math.ceil(state.stage / 2)}</Label>
          </Pressable>
          <Pressable feedback={false} accessibilityRole="button" accessibilityLabel={`배속 ${state.rate}배, 변경`} onPress={openOptions}
            style={{ flex: 1, minHeight: 44, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7 }}>
            <Icon name="speedometer" /><Label size={14} weight="700">{state.rate}×</Label>
          </Pressable>
          <Pressable disabled accessibilityRole="button" accessibilityLabel="문장 분석, 아직 사용할 수 없음" accessibilityState={{ disabled: true }}
            style={{ flex: 1, minHeight: 44, alignItems: 'center', justifyContent: 'center', opacity: 0.4 }}>
            <Icon name="text.magnifyingglass" />
          </Pressable>
        </View>
        <View style={{ flex: 1, justifyContent: 'center', paddingVertical: 16 }}>
          <Animated.View key={`${state.runId}:${state.phrase}:${state.phase === 'complete'}`} entering={CONTENT_ENTER}>
          <Card style={{ gap: 22, paddingVertical: 26 }}>
            {state.phase === 'complete' ? <><Label size={30} weight="800" color={c.heading}>잘 마쳤어요!</Label><Label muted>열두 문장을 내 목소리로 연습했어요.</Label></> : <>
              <Label size={29} display color={c.heading}>{phrase?.text}</Label><Label size={18} muted>{phrase?.translation}</Label>
            </>}
          </Card>
          </Animated.View>
        </View>
        <CycleTimeline key={`${state.runId}:${state.phrase}`} state={state} duration={duration} />
      </>}
    </ScrollView>
    {state && <View style={{ paddingHorizontal: 24, paddingTop: 16, gap: 12,
      backgroundColor: c.background, paddingBottom: Math.max(insets.bottom, 14) }}>
      <PlayerControls action={mainPlayerAction(state, error)} repeat={canOfferRepeat(state, error)} busy={busy}
        onMain={() => void act()} onRepeat={() => void act(true)} />
    </View>}
  </View>;
}
