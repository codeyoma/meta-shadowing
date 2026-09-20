import { isPlaybackRate, isSpeakingWpm, type Settings } from './settings';
import { normalizeSpeakingSpeeds } from './speaking-speed';
import { isGroupedStage, isPlayableStage, isRevealStage, type PlayableStage } from './catalog';
import { isGroupSize, type GroupSize } from './learning-units';
import { selectUnit, unitProgress, type UnitProgress } from './unit-progress';
// 'auto' is accepted only to migrate previously persisted version-1 checkpoints.
export type Mode = 'manual' | 'auto';
export type Phase = 'ready' | 'listening' | 'speaking' | 'decision' | 'complete';
export type Session = {
  runId: string; stage: PlayableStage; phraseCount: number; phrase: number;
  mode: Mode; rate: number; confirmed: number; planned: number;
  phase: Phase; running: boolean; audioSeconds: number; remainingMs: number;
  unitProgress?: UnitProgress[];
  /** Silent stages use audioSeconds as their elapsed reveal timeline, not audio. */
  reveal?: { speed: 1 | 2 | 3 | 4; wpm: number };
} & ({ version: 1 } | { version: 2; sourcePhraseCount: number; groupSize: GroupSize });
export type Action =
  | { type: 'resume' | 'pause' | 'confirm' | 'repeat' | 'next' }
  | { type: 'audio-position'; seconds: number }
  | { type: 'audio-ended'; durationSeconds: number }
  | { type: 'tick'; elapsedMs: number };

export function changeSessionRate(state: Session, rate: number): Session {
  if (state.running || !isPlaybackRate(rate)) throw Error('Pause before changing playback speed.');
  return { ...state, rate };
}

export function createSession(input: Pick<Session, 'runId' | 'stage' | 'phraseCount' | 'mode' | 'rate'> & Pick<Settings, 'crazyWpm'>): Session {
  if (!isPlaybackRate(input.rate)) throw Error('Invalid playback rate.');
  if (!isPlayableStage(input.stage) || isGroupedStage(input.stage) || !Number.isSafeInteger(input.phraseCount) || input.phraseCount < 1) throw Error('Invalid session plan.');
  const planned = isRevealStage(input.stage) ? 1 : 3;
  return { runId: input.runId, stage: input.stage, phraseCount: input.phraseCount, rate: input.rate,
    mode: 'manual', version: 1, phrase: 0, confirmed: 0, planned, phase: 'ready',
    ...(isRevealStage(input.stage) ? { reveal: { speed: 1 as const, wpm: normalizeSpeakingSpeeds(input.crazyWpm)[0] } } : {}),
    unitProgress: Array.from({ length: input.phraseCount }, () => ({ confirmed: 0, planned })),
    running: false, audioSeconds: 0, remainingMs: 0 };
}

export function createGroupedSession(input: Pick<Session, 'runId' | 'stage' | 'mode' | 'rate'> & { sourcePhraseCount: number; groupSize: GroupSize }): Session {
  if (!isGroupedStage(input.stage) || !isGroupSize(input.groupSize) || !Number.isSafeInteger(input.sourcePhraseCount) || input.sourcePhraseCount < 1) throw Error('Invalid grouped session plan.');
  const state = { ...createSession({ ...input, stage: 1, phraseCount: Math.ceil(input.sourcePhraseCount / input.groupSize) }),
    version: 2 as const, stage: input.stage, sourcePhraseCount: input.sourcePhraseCount, groupSize: input.groupSize };
  return restoreSession(JSON.stringify(state), input.sourcePhraseCount, input.stage);
}

function confirm(s: Session): Session {
  const confirmed = s.confirmed + 1;
  const done = confirmed >= s.planned;
  return { ...s, confirmed, phase: done ? 'decision' : 'ready', running: false,
    audioSeconds: 0, remainingMs: 0 };
}

/** The third-cycle choices stay visible once playback starts, even while locked. */
export function canShowThirdCycleChoices(s: Session): boolean {
  return !isRevealStage(s.stage) && s.planned === 3 && s.confirmed === 2 && (s.phase === 'listening' || s.phase === 'speaking');
}

function isFinalSpeakingCycle(s: Session): boolean {
  return (isRevealStage(s.stage) || s.planned === 3 || s.planned === 5)
    && s.phase === 'speaking' && s.confirmed + 1 === s.planned;
}

export function canChooseRepeat(s: Session): boolean {
  return !isRevealStage(s.stage) && s.planned === 3 && (s.phase === 'decision' || isFinalSpeakingCycle(s));
}

export function canChooseNext(s: Session): boolean {
  return s.phase === 'decision' || isFinalSpeakingCycle(s);
}

export function transition(s: Session, action: Action): Session {
  const next = transitionCurrent(s, action);
  return next.unitProgress ? { ...next, unitProgress: unitProgress(next) } : next;
}
function transitionCurrent(s: Session, action: Action): Session {
  if (action.type === 'repeat' && !canChooseRepeat(s)) return s;
  if (action.type === 'next' && !canChooseNext(s)) return s;
  if (s.mode !== 'manual') s = { ...s, mode: 'manual' };
  if ((action.type === 'repeat' || action.type === 'next') && isFinalSpeakingCycle(s)) s = confirm(s);
  switch (action.type) {
    case 'resume':
      return s.phase === 'decision' || s.phase === 'complete' ? s
        : { ...s, phase: s.phase === 'ready' ? 'listening' : s.phase, running: true };
    case 'pause': return { ...s, running: false };
    case 'audio-position':
      return s.phase === 'listening' && s.running && Number.isFinite(action.seconds)
        ? { ...s, audioSeconds: Math.max(0, action.seconds) } : s;
    case 'audio-ended':
      return s.phase === 'listening' && s.running
        ? { ...s, phase: 'speaking', audioSeconds: 0,
            remainingMs: 0 } : s;
    case 'confirm': return s.phase === 'speaking' && s.running && s.mode === 'manual'
      ? isRevealStage(s.stage) ? transitionCurrent(confirm(s), { type: 'next' }) : confirm(s) : s;
    case 'tick': return s;
    case 'repeat': return s.phase === 'decision' && s.planned === 3
      ? { ...s, planned: s.planned + 2, phase: 'ready', running: false } : s;
    case 'next':
      if (s.phase !== 'decision') return s;
      if (s.unitProgress) {
        const units = unitProgress(s);
        const gap = units.findIndex(unit => unit.confirmed < unit.planned);
        if (gap < 0) return { ...selectUnit(s, s.phraseCount - 1), phase: 'complete' };
        return selectUnit(s, s.phrase + 1 < s.phraseCount ? s.phrase + 1 : gap);
      }
      return s.phrase + 1 === s.phraseCount
        ? { ...s, phase: 'complete', running: false }
        : { ...s, phrase: s.phrase + 1, confirmed: 0, planned: isRevealStage(s.stage) ? 1 : 3, phase: 'ready',
            running: false, audioSeconds: 0, remainingMs: 0 };
  }
}

export function restoreSession(json: string, sourcePhraseCount: number, stage: PlayableStage): Session {
  const s: Session = JSON.parse(json);
  const grouped = isGroupedStage(stage);
  const silent = isRevealStage(stage);
  if (!s || !isPlayableStage(stage) || !Number.isSafeInteger(sourcePhraseCount) || sourcePhraseCount < 1
    || (grouped ? s.version !== 2 || !isGroupSize(s.groupSize) || s.sourcePhraseCount !== sourcePhraseCount : s.version !== 1)) {
    throw new Error('Saved learning state is incompatible or damaged.');
  }
  const phraseCount = s.version === 2 ? Math.ceil(sourcePhraseCount / s.groupSize) : sourcePhraseCount;
  if (isRevealStage(stage) ? !s.reveal || ![1, 2, 3, 4].includes(s.reveal.speed)
    || !isSpeakingWpm(s.reveal.wpm) || Object.keys(s.reveal).sort().join(',') !== 'speed,wpm' : s.reveal !== undefined) {
    throw Error('Invalid reveal checkpoint.');
  }
  const nonnegative = (n: unknown) => typeof n === 'number' && Number.isFinite(n) && n >= 0;
  if (typeof s.runId !== 'string' || !s.runId || s.runId.length > 100
    || s.stage !== stage || s.phraseCount !== phraseCount || !Number.isInteger(s.phrase)
    || s.phrase < 0 || s.phrase >= phraseCount || !['manual', 'auto'].includes(s.mode)
    || !isPlaybackRate(s.rate) || !Number.isInteger(s.confirmed) || s.confirmed < 0
    || !Number.isInteger(s.planned) || s.planned < (silent ? 1 : 3) || (!silent && (s.planned - 3) % 2 !== 0)
    || s.confirmed > s.planned || typeof s.running !== 'boolean'
    || !['ready', 'listening', 'speaking', 'decision', 'complete'].includes(s.phase)
    || !nonnegative(s.audioSeconds) || !nonnegative(s.remainingMs)
    || (['decision', 'complete'].includes(s.phase) !== (s.confirmed === s.planned))
    || (s.phase === 'complete' && s.phrase !== phraseCount - 1)
    || phraseCount > 100000 || s.planned > 100000) {
    throw new Error('Saved learning state is incompatible or damaged.');
  }
  if (s.unitProgress !== undefined) {
    if (!Array.isArray(s.unitProgress) || s.unitProgress.length !== phraseCount
      || s.unitProgress.some(unit => !unit || Object.keys(unit).sort().join(',') !== 'confirmed,planned'
        || !Number.isSafeInteger(unit.confirmed) || !Number.isSafeInteger(unit.planned)
        || unit.confirmed < 0 || unit.planned < (silent ? 1 : 3) || unit.planned > 100000
        || (!silent && unit.planned % 2 !== 1) || unit.confirmed > unit.planned)
      || s.unitProgress[s.phrase]!.confirmed !== s.confirmed || s.unitProgress[s.phrase]!.planned !== s.planned
      || (s.phase === 'complete' && s.unitProgress.some(unit => unit.confirmed !== unit.planned))) {
      throw Error('Saved unit progress is incompatible or damaged.');
    }
  }
  if (silent) {
    // Preserve confirmed ordinals (and their credit identities), not the old
    // three/five-pass plan. Loading this migration never confirms a phrase.
    s.unitProgress = unitProgress(s).map(unit => ({ ...unit,
      planned: unit.confirmed === unit.planned ? unit.planned : unit.confirmed + 1 }));
    s.planned = s.unitProgress[s.phrase]!.planned;
  }
  // Old native callers spread full preferences into sessions. Keep only the
  // learning checkpoint contract; settings remain in their own persistence.
  const metadata = s.version === 2 ? { version: 2 as const, sourcePhraseCount: s.sourcePhraseCount, groupSize: s.groupSize } : { version: 1 as const };
  return { ...metadata, ...(s.reveal ? { reveal: { ...s.reveal } } : {}), ...(s.unitProgress ? { unitProgress: s.unitProgress } : {}), runId: s.runId, stage: s.stage, phraseCount: s.phraseCount, phrase: s.phrase,
    mode: 'manual', rate: s.rate, confirmed: s.confirmed, planned: s.planned, phase: s.phase,
    running: false, audioSeconds: s.audioSeconds, remainingMs: s.remainingMs };
}
