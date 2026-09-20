import type { AudioPort } from './player';
import type { Session } from './session';
import type { Settings } from './settings';
import { isRevealStage } from './catalog';
import { normalizeSpeakingSpeeds } from './speaking-speed';

type Phrase = { text: string; translation: string };
export type RevealLine = { kind: 'target' | 'translation'; text: string; offset: number; words: number };
export type RevealSpeed = 1 | 2 | 3 | 4;
const wordCount = (text: string) => (text.match(/\S+/gu) ?? []).length;

/** Whitespace-delimited units keep punctuation attached, including Korean eojeol. */
export function revealLines(phrase: Phrase, stage: number): RevealLine[] {
  if (!isRevealStage(stage)) throw Error('Not a silent reveal stage.');
  const target = { kind: 'target' as const, text: phrase.text };
  const translation = { kind: 'translation' as const, text: phrase.translation };
  const lines = stage <= 12 ? [target, translation] : stage <= 14 ? [translation, target] : [translation];
  let offset = 0;
  return lines.filter(line => line.text.trim()).map(line => {
    const words = wordCount(line.text), result = { ...line, offset, words };
    offset += words;
    return result;
  });
}

export function visibleReveal(lines: readonly RevealLine[], seconds: number, wpm: number, complete = false) {
  const count = complete ? Infinity : Math.max(0, Math.floor(seconds * wpm / 60 + 1e-9));
  return lines.map(line => {
    let ordinal = line.offset;
    const spans = (line.text.match(/\s+|\S+/gu) ?? []).map(text => {
      if (/\S/u.test(text)) ordinal++;
      return { text, visible: ordinal <= count };
    });
    return { ...line, spans, visibleText: spans.filter(span => span.visible).map(span => span.text).join('').trim() };
  });
}

export function changeRevealSpeed(state: Session, speed: RevealSpeed, speeds?: Settings['crazyWpm']): Session {
  if (state.running || !state.reveal || !isRevealStage(state.stage) || ![1, 2, 3, 4].includes(speed)) {
    throw Error('Pause before changing reveal speed.');
  }
  const wpm = normalizeSpeakingSpeeds(speeds)[speed - 1]!;
  // Preserve partial-word progress when changing the timeline's seconds-per-word.
  return { ...state, audioSeconds: state.audioSeconds * state.reveal.wpm / wpm, reveal: { speed, wpm } };
}

export function playerSpeed(state: Session) {
  return state.reveal
    ? { label: `S${state.reveal.speed}`, accessibilityLabel: `스피킹 속도 S${state.reveal.speed}, ${state.reveal.wpm} WPM, 변경`, option: 'reveal' as const }
    : { label: `${state.rate}×`, accessibilityLabel: `재생 속도 ${state.rate}배, 변경`, option: 'rate' as const };
}

/** Silent clock implementing the player's local transport contract; never opens audio. */
export function revealPlayback(phrases: readonly Phrase[], state: Session, ended: (seconds: number) => void,
  now: () => number = () => performance.now()): AudioPort {
  if (!state.reveal || !isRevealStage(state.stage)) throw Error('Missing reveal speed.');
  const wpm = state.reveal.wpm;
  let elapsed = 0, duration = 0, started: number | null = null, disposed = false, generation = 0;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const position = () => Math.min(duration, elapsed + (started === null ? 0 : Math.max(0, now() - started) / 1000));
  const pause = () => {
    elapsed = position(); started = null; generation++;
    clearTimeout(timer); timer = undefined;
  };
  return {
    async prepare(index, seconds) {
      pause();
      const phrase = phrases[index];
      if (disposed || !Number.isInteger(index) || !phrase || !Number.isFinite(seconds) || seconds < 0) throw Error('Invalid reveal position.');
      const words = revealLines(phrase, state.stage).reduce((sum, line) => sum + line.words, 0);
      duration = Math.max(1, words) * 60 / wpm;
      elapsed = Math.min(duration, seconds);
    },
    play() {
      if (disposed || started !== null || duration <= 0) return;
      started = now();
      const token = ++generation;
      timer = setTimeout(() => {
        if (disposed || token !== generation || started === null) return;
        elapsed = duration; started = null; timer = undefined;
        ended(duration);
      }, Math.max(0, (duration - elapsed) * 1000));
    },
    pause, position, duration: () => duration,
    dispose() { pause(); disposed = true; },
  };
}
