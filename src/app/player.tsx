import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Alert, AppState, ScrollView, View } from 'react-native';
import { FeedbackPressable as Pressable } from '@/components/feedback-pressable';
import { Stack, router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { randomUUID } from 'expo-crypto';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated, { FadeIn, ReduceMotion } from 'react-native-reanimated';
import { ActionButton, Card, Icon, Label, usePalette } from '../components/ui';
import { Player } from '../core/player';
import { createSession, createGroupedSession, type Session } from '../core/session';
import { getJournal } from '../native/journal';
import { nativeAudio } from '../native/audio';
import { isInstalled } from '../native/package';
import { readSettings } from '../native/settings';
import { selectedPackage } from '@/native/catalog';
import { LearningContext, isVideoPackage } from '@/core/learning-context';
import { videoStageAvailable } from '@/core/video-package';
import { nativeVideo, disposeVideo } from '@/native/video';
import { LessonVideo } from '@/components/lesson-video';
import { playableStage, isPlayableStage, isGroupedStage, isFirstWordStage, isRevealStage, type PlayableStage } from '@/core/catalog';
import { revealPlayback, playerSpeed } from '@/core/word-reveal';
import { WordRevealContent } from '@/components/word-reveal-content';
import type { LearningUnit } from '@/core/learning-units';
import { presentLearningUnits } from '@/core/learning-presentation';
import { testStageAccess } from '@/native/stage-access';
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
import { completedUnitCount } from '@/core/session-navigation';
import { sentenceEntry } from '@/core/sentence-entry';
import { isPaidDuo, paidAccessSource, mayUsePackage } from '@/native/paid-package';
import { PaidLearningAccess } from '@/core/paid-learning-access';
import { useLearningMonitor } from '@/components/use-learning-monitor';
import { useLessonRemote } from '@/components/use-lesson-remote';
import { useLearningSettings } from '@/components/use-learning-settings';
import { useLearningDictionary } from '@/components/use-learning-dictionary';
import { visibleLookupWords } from '@/core/dictionary-words';
import { dictionary as nativeDictionary } from '../../modules/learning-dictionary';

const CONTENT_ENTER = FadeIn.duration(120).reduceMotion(ReduceMotion.System);

export default function PlayerRoute() {
  const profile = useProgressProfile();
  const { stage: param, package: key } = useLocalSearchParams<{ stage: string; package: string }>();
  const stage = playableStage(param);
  const pack = selectedPackage(key);
  if (!pack || !stage || !profile.available || (isVideoPackage(pack) && !videoStageAvailable(stage))) return <View style={{ padding: 24 }}><Label>학습을 시작할 수 없어요.</Label>
    <ActionButton title="레슨으로" onPress={() => router.replace('/lesson')} /></View>;
  return <PlayerScreen key={`${pack.packageKey}:${stage}`} pack={pack} stage={stage} />;
}

function PlayerScreen({ pack, stage }: { pack: NonNullable<ReturnType<typeof selectedPackage>>; stage: PlayableStage }) {
  const profile = useProgressProfile();
  const textSettings = useLearningSettings();
  const lesson = pack.manifest;
  const c = usePalette();
  const insets = useSafeAreaInsets();
  const engine = useRef<Player | null>(null);
  const [videoOwner] = useState(() => isVideoPackage(pack) && !isRevealStage(stage) ? randomUUID() : null);
  useEffect(() => () => { if (videoOwner) disposeVideo(videoOwner); }, [videoOwner]);
  const paidGuard = useRef<PaidLearningAccess | null>(null);
  const opened = useRef(false);
  const [state, setState] = useState<Session | null>(null);
  const [units, setUnits] = useState<LearningUnit[]>([]);
  const [revealedKey, setRevealedKey] = useState<string | null>(null);
  const [unavailable, setUnavailable] = useState(false);
  const [accessDenied, setAccessDenied] = useState(false);
  const [accessReady, setAccessReady] = useState(!isPaidDuo(pack));
  const [error, setError] = useState<'save' | 'audio' | null>(null);
  const [duration, setDuration] = useState(0);
  const [busy, setBusy] = useState(false);
  const [refreshing, setRefreshing] = useState(true);
  const [speechView, setSpeechView] = useState<'bubble' | 'list'>('bubble');
  const [celebrating, setCelebrating] = useState(false);
  const [motionActive, setMotionActive] = useState(false);
  const [xpGain, setXpGain] = useState<XpGainEvent | null>(null);
  const gainSequence = useRef(0);
  const gainOrigin = useRef<XpGainEvent['origin'] | null>(null);
  const finishXpGain = useCallback((id: number) => setXpGain(current => current?.id === id ? null : current), []);
  const finishCelebration = useCallback(() => setCelebrating(false), []);
  const acting = useRef(false);
  const unitKey = state ? `${state.runId}:${state.phrase}` : null;
  const revealed = unitKey !== null && revealedKey === unitKey;
  const revealLookupReady = !!state && mainPlayerAction(state, error) === 'next' && !busy && !refreshing && !acting.current;
  const words = useMemo(() => visibleLookupWords(state ? units[state.phrase] : undefined, stage, revealed,
    text => nativeDictionary?.words(text) ?? [], revealLookupReady), [units, state?.phrase, stage, revealed, revealLookupReady]);
  const dictionary = useLearningDictionary(() => ({
    scope: `${profile.id}:${profile.authority}:${pack.packageKey}:${stage}:${unitKey}:${revealed}`,
    player: engine.current, words,
    allowed: (!isRevealStage(stage) || (revealLookupReady && !acting.current && !!engine.current
      && mainPlayerAction(engine.current.state, engine.current.error) === 'next'))
      && !!state && state.phase !== 'complete' && !refreshing && !unavailable && !accessDenied && accessReady
      && AppState.currentState === 'active' && mayUsePackage(pack) && (!paidGuard.current || paidGuard.current.allowed())
      && getProgressSync().authorized(profile.authority, profile.id)
      && !!engine.current && `${engine.current.state.runId}:${engine.current.state.phrase}` === unitKey,
  }));
  const monitorKey = useLearningMonitor(`${profile.id}:${profile.authority}:${pack.packageKey}:${stage}`,
    state?.phase === 'complete', unavailable || accessDenied, !refreshing && accessReady && !dictionary.blocked);
  useFocusEffect(useCallback(() => {
    let active = true;
    // A drawer return keeps this scope's paused frame mounted while reloading
    // its checkpoint. Fresh routes/profile changes already mount with no state.
    setRefreshing(true);
    setBusy(false);
    setAccessReady(!isPaidDuo(pack));
    const access = isPaidDuo(pack) ? new PaidLearningAccess(paidAccessSource, () => {
      dictionary.cancel();
      sentenceEntry.cancel(); engine.current?.pause();
      if (active) { setAccessDenied(true); setCelebrating(false); setXpGain(null); }
    }, allowed => {
      if (active) { setAccessReady(allowed); if (allowed) setAccessDenied(false); }
    }) : null;
    paidGuard.current = access;
    const permitted = () => active && mayUsePackage(pack) && (!access || access.allowed());
    prepareLearningHaptics();
    setMotionActive(AppState.currentState === 'active');
    let shown: string | null = null;
    let timer: ReturnType<typeof setInterval> | undefined;
    let appState: { remove(): void } | undefined;
    let removeGuard: (() => void) | undefined;
    let interrupted = AppState.currentState !== 'active';
    const interruption = AppState.addEventListener('change', next => {
      if (next !== 'active') { interrupted = true; sentenceEntry.cancel(); access?.suspend(); }
    });
    const initialize = async () => {
      try {
        if ((access && !await access.enter()) || !await isInstalled(pack) || !permitted()) { if (active) setUnavailable(true); return; }
        const bypass = await testStageAccess();
        if (!permitted() || !getProgressSync().authorized(profile.authority, profile.id)) return;
        const context = new LearningContext(pack, getJournal());
        const predecessor = stage - 1;
        const records = isPlayableStage(predecessor) ? [{ stage: predecessor, count: context.completions(predecessor), session: null }] : [];
        if (!canOpenStage(stage, records, bypass)) {
          if (active) setUnavailable(true);
          return;
        }
        const saved = context.load(stage);
        const settings = readSettings();
        setSpeechView(settings.speechView ?? 'bubble');
        const fresh = !saved || (saved.phase === 'complete' && !opened.current);
        const initial = !fresh && saved ? saved : isGroupedStage(stage)
          ? createGroupedSession({ runId: randomUUID(), stage, sourcePhraseCount: lesson.phrases.length, ...settings, groupSize: settings.groupSize ?? 2 })
          : createSession({ runId: randomUUID(), stage, phraseCount: lesson.phrases.length, ...settings });
        const runUnits = context.units(initial);
        setUnits(runUnits);
        // Returning from options preserves a reveal only for this exact run/unit.
        setRevealedKey(key => key === `${initial.runId}:${initial.phrase}` ? key : null);
        setUnavailable(false);
        const observeFeedback = createLearningFeedback(initial);
        const observeHaptics = createCycleHaptics(initial);
        const firstEntry = !opened.current;
        opened.current = true;
        const audio = isRevealStage(stage)
          ? revealPlayback(runUnits, initial, duration => engine.current?.audioEnded(duration))
          : videoOwner
          ? nativeVideo(videoOwner, monitorKey, duration => engine.current?.audioEnded(duration), () => engine.current?.audioFailed(), () => engine.current?.pause(),
            isVideoPackage(pack) ? pack.manifest.phrases.map(p => p.end - p.start) : [], runUnits.map(unit => unit.sourceIndices))
          : nativeAudio(pack, duration => engine.current?.audioEnded(duration), () => engine.current?.audioFailed(), () => engine.current?.pause(), runUnits.map(unit => unit.sourceIndices), monitorKey);
        const save = context.createWriter(initial);
        const player = new Player(initial, audio, s => {
          const earned = save(s);
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
          setRevealedKey(key => key === `${player.state.runId}:${player.state.phrase}` ? key : null);
          setState({ ...player.state }); setError(player.error);
          const mediaDuration = audio.duration?.() ?? 0;
          if (mediaDuration > 0) setDuration(mediaDuration);
          if (player.error && player.error !== shown) {
            shown = player.error;
            Alert.alert(player.error === 'save' ? '학습을 저장하지 못했어요' : videoOwner ? '동영상을 재생할 수 없어요' : '음성을 재생할 수 없어요',
              player.error === 'save' ? '학습을 잠시 멈췄어요. 저장 공간을 확인하고 다시 시도해 주세요.' : '학습 위치는 유지됩니다. 다시 시도하거나 레슨을 재설치해 주세요.',
              [{ text: '나중에', style: 'cancel' }, { text: '다시 시도', onPress: () => {
                if (!permitted() || engine.current !== player || AppState.currentState !== 'active') return;
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
          dictionary.cancel();
          sentenceEntry.cancel();
          player.pause();
          if (player.error === 'save') throw Error('progress-cloud-storage');
        });
        acting.current = false; setBusy(false); setRefreshing(false);
        setState({ ...initial });
        timer = setInterval(() => { if (AppState.currentState === 'active') player.tick(); }, 100);
        appState = AppState.addEventListener('change', next => {
          setMotionActive(next === 'active');
          if (next !== 'active') { stopLearningHaptics(); setCelebrating(false); setXpGain(null); player.pause(); }
          else { prepareLearningHaptics(); if (access) void access.enter(); }
        });
        const selectedEntry = sentenceEntry.consume({ profile: `${profile.id}:${profile.authority}`, packageKey: pack.packageKey, stage, runId: initial.runId, phrase: initial.phrase });
        if (!interrupted && (selectedEntry || (firstEntry && !profile.suppressEntry)) && AppState.currentState === 'active') {
          setBusy(true);
          await player.enter();
          if (active) setBusy(false);
        }
      } catch { if (active) { setUnavailable(true); Alert.alert('학습을 열 수 없어요', '기록을 초기화하지 않았어요. 저장 공간과 레슨 설치 상태를 확인해 주세요.'); } }
    };
    void initialize();
    return () => { active = false; access?.dispose(); interruption.remove(); sentenceEntry.cancel(); stopLearningHaptics(); setMotionActive(false); setCelebrating(false); setXpGain(null); gainOrigin.current = null; removeGuard?.(); if (timer) clearInterval(timer); appState?.remove(); engine.current?.dispose(); engine.current = null; };
  }, [stage, pack, lesson, profile.id, profile.authority, profile.suppressEntry, monitorKey, videoOwner]));
  const leave = () => { engine.current?.pause(); if (engine.current?.error !== 'save') { if (router.canGoBack()) router.back(); else router.replace('/lesson'); } };
  const openOptions = useCallback((option?: 'rate' | 'reveal') => {
    if (dictionary.isBlocked() || !mayUsePackage(pack) || (paidGuard.current && !paidGuard.current.allowed()) || unavailable) return;
    engine.current?.pause();
    if (stage && engine.current && engine.current.error !== 'save' && getProgressSync().authorized(profile.authority, profile.id)) router.push({ pathname: '/player-options', params: { stage, package: pack.packageKey, run: engine.current.state.runId, profile: profile.id, authority: profile.authority, monitorKey, ...(option ? { option } : {}) } });
  }, [pack, unavailable, stage, profile.authority, profile.id, monitorKey]);
  const openInfo = useCallback((kind: 'guide' | 'analysis') => {
    if (dictionary.isBlocked() || !mayUsePackage(pack) || (paidGuard.current && !paidGuard.current.allowed()) || unavailable) return;
    engine.current?.pause();
    if (!stage || !engine.current || engine.current.error === 'save' || !getProgressSync().authorized(profile.authority, profile.id)) return;
    router.push({ pathname: '/player-info', params: { kind, stage, package: pack.packageKey, phrase: engine.current.state.phrase, authority: profile.authority } });
  }, [pack, unavailable, stage, profile.authority, profile.id]);
  async function act(point: ControlPressPoint, repeat = false) {
    const player = engine.current;
    if (dictionary.isBlocked() || AppState.currentState !== 'active' || !player || refreshing || unavailable || !mayUsePackage(pack) || (paidGuard.current && !paidGuard.current.allowed()) || acting.current || !getProgressSync().authorized(profile.authority, profile.id)) return;
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
          if (dictionary.isBlocked() || AppState.currentState !== 'active' || engine.current !== player
            || !mayUsePackage(pack) || (paidGuard.current && !paidGuard.current.allowed())
            || !getProgressSync().authorized(profile.authority, profile.id)) { player.pause(); return; }
          await player.confirm(); break;
        case 'next': await player.choose('next'); break;
        case 'leave': tapFeedback(); leave(); break;
        case 'recover': player.retrySave(); if (!player.error) await player.resume(); break;
        case 'wait': break;
      }
    } finally { gainOrigin.current = null; acting.current = false; setBusy(false); }
  }
  useLessonRemote(state, error, !dictionary.blocked && !refreshing && !busy && !unavailable && !accessDenied && accessReady,
    monitorKey, () => void act({ x: 0, y: 0 }), () => void act({ x: 0, y: 0 }, true));
  const unitLabel = isGroupedStage(stage) ? '학습 묶음' : '학습 구간';
  const presented = presentLearningUnits(units, stage, revealed && state ? state.phrase : null);
  // A fresh header function on navigation rerenders can feed setOptions back
  // into multiple mounted player routes. Change it only with its inputs.
  const headerOptions = useMemo(() => ({ title: '학습', headerBackVisible: false,
      header: () => <PlayerHeaderProgress onOptions={() => openOptions()} current={state ? state.phrase + 1 : 0}
        total={state?.phraseCount ?? 0} unitLabel={unitLabel}
        completed={state ? completedUnitCount(state) : 0}>
      {state && accessReady && !unavailable && !accessDenied &&
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
          <Pressable feedback={false} accessibilityRole="button" accessibilityLabel={`메타쉐도잉 레벨 ${Math.ceil(state.stage / 2)}, 학습 가이드 열기`} onPress={() => openInfo('guide')}
            style={{ flex: 1, minHeight: 44, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7 }}>
            <Icon name="graduationcap.fill" /><Label size={14} weight="700">Lv {Math.ceil(state.stage / 2)}</Label>
          </Pressable>
          <Pressable feedback={false} accessibilityRole="button" accessibilityLabel={playerSpeed(state).accessibilityLabel} onPress={() => openOptions(playerSpeed(state).option)}
            style={{ flex: 1, minHeight: 44, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7 }}>
            <Icon name="speedometer" /><Label size={14} weight="700">{playerSpeed(state).label}</Label>
          </Pressable>
          <Pressable feedback={false} accessibilityRole="button" accessibilityLabel="문장 분석 열기" onPress={() => openInfo('analysis')}
            style={{ flex: 1, minHeight: 44, alignItems: 'center', justifyContent: 'center' }}>
            <Icon name="text.magnifyingglass" />
          </Pressable>
        </View>}
      </PlayerHeaderProgress> }), [state, unitLabel, accessReady, unavailable, accessDenied, openOptions, openInfo]);
  return <View style={{ flex: 1 }}>
    <Stack.Screen options={headerOptions} />
    {state && accessReady && !unavailable && !accessDenied && videoOwner && !isRevealStage(stage) && state.phase !== 'complete' && <LessonVideo />}
    <ScrollView style={{ flex: 1 }} contentInsetAdjustmentBehavior="automatic" contentContainerStyle={{ flexGrow: 1, paddingTop: 20, paddingBottom: 24, gap: 20 }}>
      {unavailable || accessDenied ? <View style={{ paddingHorizontal: 24 }}><Card><Label>구매 내역과 레슨 설치 상태를 확인해 주세요. 학습 기록은 유지돼요.</Label>
        {error === 'save' && <ActionButton title="기록 저장 다시 시도" onPress={() => engine.current?.retrySave()} />}
        <ActionButton title="레슨으로" onPress={leave} /></Card></View> : !state || !accessReady ? <View style={{ paddingHorizontal: 24 }}><Label muted>레슨을 여는 중…</Label></View> : <>
        <View style={{ flex: 1, ...(videoOwner && !isRevealStage(stage) && state.phase !== 'complete'
          ? { justifyContent: 'flex-start' as const }
          : { justifyContent: 'center' as const, paddingVertical: 16 }) }}>
          <Animated.View key={`${state.runId}:${state.phrase}:${state.phase === 'complete'}`} entering={CONTENT_ENTER} style={{ paddingHorizontal: 24 }}>
          {state.phase === 'complete'
            ? <Card style={{ gap: 22, paddingVertical: 26 }}>
              <Label size={30} weight="800" color={c.heading}>잘 마쳤어요!</Label>
              <Label muted>스테이지 {state.stage} · 메타쉐도잉 Lv {Math.ceil(state.stage / 2)}{ '\n' }
                {methodNames[Math.ceil(state.stage / 2) - 1]} 학습을 마쳤어요.</Label>
              <Label muted>{state.phraseCount}개 {unitLabel}을 내 목소리로 연습했어요.</Label>
            </Card>
            : isRevealStage(stage) ? <WordRevealContent phrase={units[state.phrase]} state={state} view={speechView} typography={textSettings ?? undefined}
                onLookup={revealLookupReady ? dictionary.lookup : undefined} />
            : <SpeechContent phrases={presented} active={state.phrase} view={speechView} unitLabel={unitLabel} typography={textSettings ?? undefined} onLookup={dictionary.lookup} />}
          </Animated.View>
        </View>
      </>}
    </ScrollView>
    {state && accessReady && !unavailable && !accessDenied && <View style={{ paddingHorizontal: 24, paddingTop: 16, gap: 12,
      backgroundColor: c.background, paddingBottom: Math.max(insets.bottom, 14) }}>
      {isFirstWordStage(stage) && state.phase !== 'complete' && <Pressable feedback={false}
        accessibilityRole="button" accessibilityLabel={revealed ? '자막 숨기기' : '자막 보기'} accessibilityState={{ selected: revealed, expanded: revealed }}
        onPress={() => { if (!dictionary.isBlocked()) setRevealedKey(revealed ? null : unitKey); }}
        style={({ pressed }) => ({ alignSelf: 'flex-end', minHeight: 44, paddingHorizontal: 14, paddingVertical: 8,
          flexDirection: 'row', gap: 7, alignItems: 'center', justifyContent: 'center', borderRadius: 14,
          borderCurve: 'continuous', borderWidth: 1, borderColor: c.line, backgroundColor: pressed ? c.soft : c.card })}>
        <Icon name={revealed ? 'eye.slash' : 'eye'} size={17} />
        <Label size={15} weight="700">{revealed ? '자막 숨기기' : '자막 보기'}</Label>
      </Pressable>}
      {!isRevealStage(stage) && !unavailable && state.phase !== 'complete' && <CycleTimeline key={`${state.runId}:${state.phrase}`} state={state} duration={duration} animate={motionActive && !error} />}
      <View>
        <PlayerControls action={mainPlayerAction(state, error)} repeat={canOfferRepeat(state, error)} busy={busy} blocked={refreshing || dictionary.blocked}
          onMain={point => void act(point)} onRepeat={point => void act(point, true)} />
        {xpGain && motionActive && <XpGain key={xpGain.id} event={xpGain} onFinish={finishXpGain} />}
      </View>
    </View>}
    {celebrating && motionActive && <CompletionConfetti onFinish={finishCelebration} />}
  </View>;
}
