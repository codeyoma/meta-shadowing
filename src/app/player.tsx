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
import { isInstalled } from '../native/package';
import { readSettings } from '../native/settings';
import { selectedPackage } from '@/native/catalog';
import { LearningContext } from '@/core/learning-context';
import { playableStage } from '@/core/catalog';
import { canOpenStage } from '@/core/stage-overview';
import { CycleTimeline } from '@/components/cycle-timeline';
import { PlayerControls, type ControlPressPoint } from '@/components/player-controls';
import { canOfferRepeat, mainPlayerAction } from '@/core/player-presentation';
import { methodNames } from '@/components/method-label';
import { PlayerHeaderProgress } from '@/components/player-header-progress';
import { getProgressSync } from '@/native/progress-sync';
import { useProgressProfile } from '@/components/progress-profile';
import { SpeechContent } from '@/components/speech-content';
import { CompletionConfetti } from '@/components/completion-confetti';
import { createLearningFeedback } from '@/core/learning-feedback';
import { learningHaptic, prepareLearningHaptics, stopLearningHaptics, tapFeedback } from '@/native/tap-feedback';
import { createCycleHaptics } from '@/core/cycle-haptics';
import { XpGain, type XpGainEvent } from '@/components/xp-gain';

const CONTENT_ENTER = FadeIn.duration(120).reduceMotion(ReduceMotion.System);

export default function PlayerRoute() {
  const { stage: param, package: key } = useLocalSearchParams<{ stage: string; package: string }>();
  const stage = playableStage(param);
  const pack = selectedPackage(key);
  if (!pack || !stage) return <View style={{ padding: 24 }}><Label>학습을 시작할 수 없어요.</Label>
    <ActionButton title="레슨으로" onPress={() => router.replace('/lesson')} /></View>;
  return <PlayerScreen key={`${pack.packageKey}:${stage}`} pack={pack} stage={stage} />;
}

function PlayerScreen({ pack, stage }: { pack: NonNullable<ReturnType<typeof selectedPackage>>; stage: 1 | 2 }) {
  const profile = useProgressProfile();
  const lesson = pack.manifest;
  const c = usePalette();
  const insets = useSafeAreaInsets();
  const engine = useRef<Player | null>(null);
  const opened = useRef(false);
  const [state, setState] = useState<Session | null>(null);
  const [unavailable, setUnavailable] = useState(false);
  const [error, setError] = useState<'save' | 'audio' | null>(null);
  const [duration, setDuration] = useState(0);
  const [busy, setBusy] = useState(false);
  const [speechView, setSpeechView] = useState<'bubble' | 'list'>('bubble');
  const [celebrating, setCelebrating] = useState(false);
  const [motionActive, setMotionActive] = useState(false);
  const [xpGain, setXpGain] = useState<XpGainEvent | null>(null);
  const gainSequence = useRef(0);
  const gainOrigin = useRef<XpGainEvent['origin'] | null>(null);
  const finishXpGain = useCallback((id: number) => setXpGain(current => current?.id === id ? null : current), []);
  const finishCelebration = useCallback(() => setCelebrating(false), []);
  const acting = useRef(false);
  useFocusEffect(useCallback(() => {
    let active = true;
    prepareLearningHaptics();
    setMotionActive(AppState.currentState === 'active');
    let shown: string | null = null;
    let timer: ReturnType<typeof setInterval> | undefined;
    let appState: { remove(): void } | undefined;
    let removeGuard: (() => void) | undefined;
    const initialize = async () => {
      try {
        if (!await isInstalled(pack)) { if (active) setUnavailable(true); return; }
        if (!active || getProgressSync().profiles.id() !== profile.id) return;
        const context = new LearningContext(pack, getJournal());
        if (!canOpenStage(stage, [{ stage: 1, count: context.completions(1), session: null }])) {
          if (active) setUnavailable(true);
          return;
        }
        const saved = context.load(stage);
        setSpeechView(readSettings().speechView ?? 'bubble');
        const fresh = !saved || (saved.phase === 'complete' && !opened.current);
        const initial = !fresh && saved ? saved : createSession({ runId: randomUUID(), stage, phraseCount: lesson.phrases.length, ...readSettings() });
        const observeFeedback = createLearningFeedback(initial);
        const observeHaptics = createCycleHaptics(initial);
        const firstEntry = !opened.current;
        opened.current = true;
        const audio = nativeAudio(pack, duration => engine.current?.audioEnded(duration), () => engine.current?.audioFailed(), () => engine.current?.pause());
        const player = new Player(initial, audio, s => {
          const earned = context.save(s);
          if (earned > 0 && gainOrigin.current && active && AppState.currentState === 'active') {
            setXpGain({ id: ++gainSequence.current, amount: earned, origin: gainOrigin.current });
          }
          const event = observeFeedback(s);
          const pulses = observeHaptics(s);
          if (pulses && active) learningHaptic(pulses);
          if (event && active && AppState.currentState === 'active') {
            // Cosmetic effects are downstream of the durable write, never part of it.
            try {
              if (event === 'complete') setCelebrating(true);
            } catch { /* Optional feedback cannot turn a successful save into failure. */ }
          }
        }, () => performance.now(), () => {
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
        removeGuard = getProgressSync().beforeSwitch(() => {
          player.pause();
          if (player.error === 'save') throw Error('progress-cloud-storage');
        });
        acting.current = false; setBusy(false);
        setState({ ...initial });
        timer = setInterval(() => { if (AppState.currentState === 'active') player.tick(); }, 100);
        appState = AppState.addEventListener('change', next => {
          setMotionActive(next === 'active');
          if (next !== 'active') { stopLearningHaptics(); setCelebrating(false); setXpGain(null); player.pause(); }
          else prepareLearningHaptics();
        });
        if (firstEntry && !profile.suppressEntry && AppState.currentState === 'active') {
          setBusy(true);
          await player.enter();
          if (active) setBusy(false);
        }
      } catch { if (active) { setUnavailable(true); Alert.alert('학습을 열 수 없어요', '기록을 초기화하지 않았어요. 저장 공간과 레슨 설치 상태를 확인해 주세요.'); } }
    };
    void initialize();
    return () => { active = false; stopLearningHaptics(); setMotionActive(false); setCelebrating(false); setXpGain(null); gainOrigin.current = null; removeGuard?.(); if (timer) clearInterval(timer); appState?.remove(); engine.current?.dispose(); engine.current = null; };
  }, [stage, pack, lesson, profile.id, profile.suppressEntry]));
  const leave = () => { engine.current?.pause(); if (engine.current?.error !== 'save') { if (router.canGoBack()) router.back(); else router.replace('/lesson'); } };
  const openOptions = (option?: 'rate') => {
    engine.current?.pause();
    if (stage && engine.current && engine.current.error !== 'save') router.push({ pathname: '/player-options', params: { stage, package: pack.packageKey, ...(option ? { option } : {}) } });
  };
  const openInfo = (kind: 'guide' | 'analysis') => {
    engine.current?.pause();
    if (!stage || !engine.current || engine.current.error === 'save') return;
    router.push({ pathname: '/player-info', params: { kind, stage, package: pack.packageKey, phrase: engine.current.state.phrase } });
  };
  async function act(point: ControlPressPoint, repeat = false) {
    const player = engine.current;
    if (!player || acting.current) return;
    acting.current = true; setBusy(true);
    const action = mainPlayerAction(player.state, player.error);
    gainOrigin.current = action === 'confirm' || action === 'next'
      ? point : null;
    try {
      if (repeat) {
        if (canOfferRepeat(player.state, player.error)) await player.choose('repeat');
        return;
      }
      switch (mainPlayerAction(player.state, player.error)) {
        case 'resume': tapFeedback(); await player.resume(); break;
        case 'confirm':
          if (!player.state.running) await player.resume();
          await player.confirm(); break;
        case 'next': await player.choose('next'); break;
        case 'leave': tapFeedback(); leave(); break;
        case 'recover': player.retrySave(); if (!player.error) await player.resume(); break;
        case 'wait': break;
      }
    } finally { gainOrigin.current = null; acting.current = false; setBusy(false); }
  }
  return <View style={{ flex: 1 }}>
    <Stack.Screen options={{ title: '학습', headerBackVisible: false,
      header: () => <PlayerHeaderProgress onOptions={() => openOptions()} current={state ? state.phrase + 1 : 1}
        total={state?.phraseCount ?? lesson.phrases.length}
        completed={state ? state.phase === 'complete' ? state.phraseCount : state.phrase : 0} /> }} />
    <ScrollView contentInsetAdjustmentBehavior="automatic" contentContainerStyle={{ flexGrow: 1, paddingHorizontal: 24, paddingBottom: 24, gap: 20 }}>
      {unavailable ? <Card><Label>학습을 시작할 수 없어요.</Label><ActionButton title="레슨으로" onPress={leave} /></Card> : !state ? <Label muted>레슨을 여는 중…</Label> : <>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
          <Pressable feedback={false} accessibilityRole="button" accessibilityLabel={`메타쉐도잉 레벨 ${Math.ceil(state.stage / 2)}, 학습 가이드 열기`} onPress={() => openInfo('guide')}
            style={{ flex: 1, minHeight: 44, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7 }}>
            <Icon name="graduationcap.fill" /><Label size={14} weight="700">Lv {Math.ceil(state.stage / 2)}</Label>
          </Pressable>
          <Pressable feedback={false} accessibilityRole="button" accessibilityLabel={`재생 속도 ${state.rate}배, 변경`} onPress={() => openOptions('rate')}
            style={{ flex: 1, minHeight: 44, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7 }}>
            <Icon name="speedometer" /><Label size={14} weight="700">{state.rate}×</Label>
          </Pressable>
          <Pressable feedback={false} accessibilityRole="button" accessibilityLabel="문장 분석 열기" onPress={() => openInfo('analysis')}
            style={{ flex: 1, minHeight: 44, alignItems: 'center', justifyContent: 'center' }}>
            <Icon name="text.magnifyingglass" />
          </Pressable>
        </View>
        <View style={{ flex: 1, justifyContent: 'center', paddingVertical: 16 }}>
          <Animated.View key={`${state.runId}:${state.phrase}:${state.phase === 'complete'}`} entering={CONTENT_ENTER}>
          {state.phase === 'complete'
            ? <Card style={{ gap: 22, paddingVertical: 26 }}>
              <Label size={30} weight="800" color={c.heading}>잘 마쳤어요!</Label>
              <Label muted>스테이지 {state.stage} · 메타쉐도잉 Lv {Math.ceil(state.stage / 2)}{ '\n' }
                {methodNames[Math.ceil(state.stage / 2) - 1]} 학습을 마쳤어요.</Label>
              <Label muted>{state.phraseCount}개 문장을 내 목소리로 연습했어요.</Label>
            </Card>
            : <SpeechContent phrases={lesson.phrases} active={state.phrase} view={speechView} />}
          </Animated.View>
        </View>
      </>}
    </ScrollView>
    {state && <View style={{ paddingHorizontal: 24, paddingTop: 16, gap: 12,
      backgroundColor: c.background, paddingBottom: Math.max(insets.bottom, 14) }}>
      {!unavailable && state.phase !== 'complete' && <CycleTimeline key={`${state.runId}:${state.phrase}`} state={state} duration={duration} animate={motionActive && !error} />}
      <View>
        <PlayerControls action={mainPlayerAction(state, error)} repeat={canOfferRepeat(state, error)} busy={busy}
          onMain={point => void act(point)} onRepeat={point => void act(point, true)} />
        {xpGain && motionActive && <XpGain key={xpGain.id} event={xpGain} onFinish={finishXpGain} />}
      </View>
    </View>}
    {celebrating && motionActive && <CompletionConfetti onFinish={finishCelebration} />}
  </View>;
}
