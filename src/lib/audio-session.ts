type ActivePhase = "loading" | "playing" | "gap" | "speaking" | "countdown";

export type AudioPracticeLevel = 1 | 2 | 3 | 4 | 5;

export const PLAYBACK_RATES = [0.5, 0.75, 1, 1.25, 1.5, 1.75, 2, 2.25, 2.5, 2.75, 3];

export type AudioSessionSettings = {
  mode: "manual" | "automatic";
  playbackRate: number;
  advanceDelayMs: number;
  groupGapMs?: number;
};

export type AudioSession = {
  level: AudioPracticeLevel;
  subtitlesRevealed: boolean;
  phraseCount: number;
  phraseIndex: number;
  groupSizes: number[];
  groupIndex: number;
  groupDurationMs: number;
  completedCycles: number;
  attempt: number;
  phase: "ready" | ActivePhase | "paused" | "error" | "completed";
  pausedPhase: ActivePhase | "ready";
  mode: "manual" | "automatic";
  playbackRate: number;
  advanceDelayMs: number;
  groupGapMs: number;
  remainingMs: number;
};

export type AudioSessionEvent =
  | { type: "space" | "retry" | "pause" | "previous" | "next" | "reveal-subtitles" }
  | { type: "audio-playing" | "audio-error"; attempt: number }
  | { type: "tick"; elapsedMs: number; attempt: number }
  | ({ type: "settings" } & Partial<AudioSessionSettings>)
  | { type: "audio-ended"; attempt: number; durationMs: number };

export function hasSessionTimer(session: AudioSession): boolean {
  return ["speaking", "countdown"].includes(session.phase)
    || (session.phase === "paused" && ["speaking", "countdown"].includes(session.pausedPhase));
}

export function createAudioSession({
  phraseCount, groupSizes, level = 1, mode = "manual", advanceDelayMs = 1000, playbackRate = 1, groupGapMs = 500, initialGroupIndex = 0
}: { phraseCount: number; groupSizes?: number[]; level?: AudioPracticeLevel; initialGroupIndex?: number } & Partial<AudioSessionSettings>): AudioSession {
  const validGroups = level >= 4 && groupSizes?.every(size => Number.isInteger(size) && size > 0)
    && groupSizes.reduce((sum, size) => sum + size, 0) === phraseCount;
  const sizes = validGroups ? [...groupSizes!] : Array.from({ length: phraseCount }, () => 1);
  const groupIndex = Number.isInteger(initialGroupIndex) && initialGroupIndex >= 0 && initialGroupIndex < sizes.length ? initialGroupIndex : 0;
  return {
    level, subtitlesRevealed: false, phraseCount, phraseIndex: sizes.slice(0, groupIndex).reduce((a, b) => a + b, 0), completedCycles: 0, attempt: 0, phase: "ready",
    groupSizes: sizes,
    groupIndex, groupDurationMs: 0,
    pausedPhase: "loading", mode, remainingMs: 0,
    advanceDelayMs: Number.isFinite(advanceDelayMs) && advanceDelayMs >= 0 && advanceDelayMs <= 30000 ? advanceDelayMs : 1000,
    groupGapMs: Number.isFinite(groupGapMs) && groupGapMs >= 0 && groupGapMs <= 30000 ? groupGapMs : 500,
    playbackRate: PLAYBACK_RATES.includes(playbackRate) ? playbackRate : 1
  };
}

function groupFirstPhrase(session: AudioSession): number {
  return session.groupSizes.slice(0, session.groupIndex).reduce((sum, size) => sum + size, 0);
}

function startListen(session: AudioSession): AudioSession {
  const startsNewCycle = session.phase === "ready" || hasSessionTimer(session);
  return {
    ...session, phase: "loading", attempt: session.attempt + 1, remainingMs: 0,
    phraseIndex: groupFirstPhrase(session), groupDurationMs: 0,
    subtitlesRevealed: startsNewCycle ? false : session.subtitlesRevealed
  };
}

function advanceGroup(session: AudioSession): AudioSession {
  if (session.groupIndex + 1 >= session.groupSizes.length) return { ...session, phase: "completed", attempt: session.attempt + 1 };
  const next: AudioSession = {
    ...session, phase: "ready", groupIndex: session.groupIndex + 1,
    phraseIndex: groupFirstPhrase(session) + session.groupSizes[session.groupIndex],
    completedCycles: 0, attempt: session.attempt + 1, remainingMs: 0, subtitlesRevealed: false, groupDurationMs: 0
  };
  return session.mode === "automatic" ? startListen(next) : next;
}

export function transitionAudioSession(session: AudioSession, event: AudioSessionEvent): AudioSession {
  if (session.phase === "completed") return session;
  switch (event.type) {
    case "reveal-subtitles":
      return session.level === 3 || session.level === 5 ? { ...session, subtitlesRevealed: true } : session;
    case "pause":
      if (!["ready", "loading", "playing", "gap", "speaking", "countdown"].includes(session.phase)) return session;
      return { ...session, phase: "paused", pausedPhase: session.phase as ActivePhase | "ready" };
    case "previous":
      if (session.groupIndex === 0) return session;
      return {
        ...session, groupIndex: session.groupIndex - 1,
        phraseIndex: groupFirstPhrase(session) - session.groupSizes[session.groupIndex - 1],
        completedCycles: 0, phase: "ready", attempt: session.attempt + 1, remainingMs: 0, subtitlesRevealed: false, groupDurationMs: 0
      };
    case "next":
      return session.completedCycles >= 3 ? advanceGroup(session) : session;
    case "space":
      if (session.phase === "error") return startListen(session);
      if (["loading", "playing", "gap"].includes(session.phase)) {
        return { ...session, phase: "paused", pausedPhase: session.phase as ActivePhase };
      }
      if (session.phase === "paused") {
        if (session.pausedPhase === "ready") return transitionAudioSession({ ...session, phase: "ready" }, event);
        return { ...session, phase: session.pausedPhase === "playing" ? "loading" : session.pausedPhase };
      }
      if (session.completedCycles >= 3) return advanceGroup(session);
      return startListen(session);
    case "retry":
      if (session.completedCycles >= 5) return advanceGroup(session);
      return startListen(session);
    case "audio-playing":
      if (event.attempt !== session.attempt || session.phase !== "loading") return session;
      return { ...session, phase: "playing" };
    case "audio-ended": {
      if (event.attempt !== session.attempt || session.phase !== "playing") return session;
      const groupDurationMs = session.groupDurationMs + event.durationMs;
      if (session.phraseIndex + 1 < groupFirstPhrase(session) + session.groupSizes[session.groupIndex]) {
        return { ...session, phase: "gap", groupDurationMs, remainingMs: session.groupGapMs };
      }
      const speakingWindow = session.level === 2 || session.level === 4
        ? { multiplier: 2.25, paddingMs: 750 }
        : { multiplier: 1.25, paddingMs: 500 };
      return {
        ...session,
        groupDurationMs,
        phase: session.mode === "automatic" ? "speaking" : "ready",
        completedCycles: session.completedCycles + 1,
        remainingMs: session.mode === "automatic"
          ? groupDurationMs / session.playbackRate * speakingWindow.multiplier + speakingWindow.paddingMs
          : 0
      };
    }
    case "audio-error":
      if (event.attempt !== session.attempt || !["loading", "playing", "paused"].includes(session.phase)) return session;
      return { ...session, phase: "error" };
    case "tick": {
      if (event.attempt !== session.attempt || !["gap", "speaking", "countdown"].includes(session.phase)) return session;
      const remainingMs = Math.max(0, session.remainingMs - event.elapsedMs);
      if (remainingMs > 0) return { ...session, remainingMs };
      if (session.phase === "gap") return { ...session, phraseIndex: session.phraseIndex + 1, attempt: session.attempt + 1, phase: "loading", remainingMs: 0 };
      if (session.phase === "countdown") return advanceGroup(session);
      if (session.completedCycles < 3) return startListen(session);
      return { ...session, phase: "countdown", remainingMs: session.advanceDelayMs };
    }
    case "settings": {
      const next = {
        ...session,
        mode: event.mode ?? session.mode,
        groupGapMs: event.groupGapMs !== undefined && Number.isFinite(event.groupGapMs) && event.groupGapMs >= 0 && event.groupGapMs <= 30000 ? event.groupGapMs : session.groupGapMs,
        playbackRate: event.playbackRate !== undefined && PLAYBACK_RATES.includes(event.playbackRate)
          ? event.playbackRate : session.playbackRate,
        advanceDelayMs: event.advanceDelayMs !== undefined && Number.isFinite(event.advanceDelayMs)
          && event.advanceDelayMs >= 0 && event.advanceDelayMs <= 30000
          ? event.advanceDelayMs : session.advanceDelayMs
      };
      return next.mode === "manual" && hasSessionTimer(session) ? { ...next, phase: "ready", remainingMs: 0 } : next;
    }
  }
}
