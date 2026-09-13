import { isPlaybackRate } from './settings';
// 'auto' is accepted only to migrate previously persisted version-1 checkpoints.
export type Mode = 'manual' | 'auto';
export type Phase = 'ready' | 'listening' | 'speaking' | 'decision' | 'complete';
export type Session = {
  version: 1; runId: string; stage: 1 | 2; phraseCount: number; phrase: number;
  mode: Mode; rate: number; confirmed: number; planned: number;
  phase: Phase; running: boolean; audioSeconds: number; remainingMs: number;
};
export type Action =
  | { type: 'resume' | 'pause' | 'confirm' | 'repeat' | 'next' }
  | { type: 'audio-position'; seconds: number }
  | { type: 'audio-ended'; durationSeconds: number }
  | { type: 'tick'; elapsedMs: number };

export function changeSessionRate(state: Session, rate: number): Session {
  if (state.running || !isPlaybackRate(rate)) throw Error('Pause before changing playback speed.');
  return { ...state, rate };
}

export function createSession(input: Pick<Session, 'runId' | 'stage' | 'phraseCount' | 'mode' | 'rate'>): Session {
  if (!isPlaybackRate(input.rate)) throw Error('Invalid playback rate.');
  return { runId: input.runId, stage: input.stage, phraseCount: input.phraseCount, rate: input.rate,
    mode: 'manual', version: 1, phrase: 0, confirmed: 0, planned: 3, phase: 'ready',
    running: false, audioSeconds: 0, remainingMs: 0 };
}

function confirm(s: Session): Session {
  const confirmed = s.confirmed + 1;
  const done = confirmed >= s.planned;
  return { ...s, confirmed, phase: done ? 'decision' : 'ready', running: false,
    audioSeconds: 0, remainingMs: 0 };
}

/** The third-cycle choices stay visible once playback starts, even while locked. */
export function canShowThirdCycleChoices(s: Session): boolean {
  return s.planned === 3 && s.confirmed === 2 && (s.phase === 'listening' || s.phase === 'speaking');
}

function isFinalSpeakingCycle(s: Session): boolean {
  return (s.planned === 3 || s.planned === 5)
    && s.phase === 'speaking' && s.confirmed + 1 === s.planned;
}

export function canChooseRepeat(s: Session): boolean {
  return s.planned === 3 && (s.phase === 'decision' || isFinalSpeakingCycle(s));
}

export function canChooseNext(s: Session): boolean {
  return s.phase === 'decision' || isFinalSpeakingCycle(s);
}

export function transition(s: Session, action: Action): Session {
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
    case 'confirm': return s.phase === 'speaking' && s.running && s.mode === 'manual' ? confirm(s) : s;
    case 'tick': return s;
    case 'repeat': return s.phase === 'decision' && s.planned === 3
      ? { ...s, planned: s.planned + 2, phase: 'ready', running: false } : s;
    case 'next':
      if (s.phase !== 'decision') return s;
      return s.phrase + 1 === s.phraseCount
        ? { ...s, phase: 'complete', running: false }
        : { ...s, phrase: s.phrase + 1, confirmed: 0, planned: 3, phase: 'ready',
            running: false, audioSeconds: 0, remainingMs: 0 };
  }
}

export function restoreSession(json: string, phraseCount: number, stage: 1 | 2): Session {
  const s: Session = JSON.parse(json);
  const nonnegative = (n: unknown) => typeof n === 'number' && Number.isFinite(n) && n >= 0;
  if (!s || s.version !== 1 || typeof s.runId !== 'string' || !s.runId || s.runId.length > 100
    || s.stage !== stage || s.phraseCount !== phraseCount || !Number.isInteger(s.phrase)
    || s.phrase < 0 || s.phrase >= phraseCount || !['manual', 'auto'].includes(s.mode)
    || !isPlaybackRate(s.rate) || !Number.isInteger(s.confirmed) || s.confirmed < 0
    || !Number.isInteger(s.planned) || s.planned < 3 || (s.planned - 3) % 2 !== 0
    || s.confirmed > s.planned || typeof s.running !== 'boolean'
    || !['ready', 'listening', 'speaking', 'decision', 'complete'].includes(s.phase)
    || !nonnegative(s.audioSeconds) || !nonnegative(s.remainingMs)
    || (['decision', 'complete'].includes(s.phase) !== (s.confirmed === s.planned))
    || (s.phase === 'complete' && s.phrase !== phraseCount - 1)) {
    throw new Error('Saved learning state is incompatible or damaged.');
  }
  // Old native callers spread full preferences into sessions. Keep only the
  // learning checkpoint contract; settings remain in their own persistence.
  return { version: 1, runId: s.runId, stage: s.stage, phraseCount: s.phraseCount, phrase: s.phrase,
    mode: 'manual', rate: s.rate, confirmed: s.confirmed, planned: s.planned, phase: s.phase,
    running: false, audioSeconds: s.audioSeconds, remainingMs: s.remainingMs };
}
