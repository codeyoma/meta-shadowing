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
  // A recording can be finished while its practice confirmation is still pending.
  confirmedCycles: number;
  cycleTarget: 3 | 5;
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
  | { type: "jump"; phraseIndex: number }
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
    level, subtitlesRevealed: false, phraseCount, phraseIndex: sizes.slice(0, groupIndex).reduce((a, b) => a + b, 0), completedCycles: 0, confirmedCycles: 0, cycleTarget: 3, attempt: 0, phase: "ready",
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
  const startsNewCycle = session.phase === "ready" || (session.phase === "paused" && session.pausedPhase === "ready") || hasSessionTimer(session);
  return {
    ...session, phase: "loading", attempt: session.attempt + 1, remainingMs: 0,
    completedCycles: session.confirmedCycles,
    phraseIndex: groupFirstPhrase(session), groupDurationMs: 0,
    subtitlesRevealed: startsNewCycle ? false : session.subtitlesRevealed
  };
}

function advanceGroup(session: AudioSession): AudioSession {
  if (session.groupIndex + 1 >= session.groupSizes.length) return { ...session, phase: "completed", attempt: session.attempt + 1 };
  const next: AudioSession = {
    ...session, phase: "ready", groupIndex: session.groupIndex + 1,
    phraseIndex: groupFirstPhrase(session) + session.groupSizes[session.groupIndex],
    completedCycles: 0, confirmedCycles: 0, cycleTarget: 3, attempt: session.attempt + 1, remainingMs: 0, subtitlesRevealed: false, groupDurationMs: 0
  };
  return session.mode === "automatic" ? startListen(next) : next;
}

function requestAdvance(session: AudioSession): AudioSession {
  if (session.mode === "automatic" && session.advanceDelayMs > 0
    && session.phase !== "countdown" && session.groupIndex + 1 < session.groupSizes.length) {
    return { ...session, phase: "countdown", remainingMs: session.advanceDelayMs, attempt: session.attempt + 1 };
  }
  return advanceGroup(session);
}

function speakingTime(session: AudioSession, durationMs = session.groupDurationMs): number {
  const extended = session.level === 2 || session.level === 4;
  return durationMs / session.playbackRate * (extended ? 2.25 : 1.25) + (extended ? 750 : 500);
}

function confirmListen(session: AudioSession): AudioSession {
  return { ...session, confirmedCycles: session.completedCycles, phase: "ready", remainingMs: 0 };
}

export function transitionAudioSession(session: AudioSession, event: AudioSessionEvent): AudioSession {
  if (event.type === "jump") {
    if (!Number.isInteger(event.phraseIndex) || event.phraseIndex < 0 || event.phraseIndex >= session.phraseCount) return session;
    let phraseIndex = 0;
    const groupIndex = session.groupSizes.findIndex(size => {
      if (event.phraseIndex < phraseIndex + size) return true;
      phraseIndex += size;
      return false;
    });
    return { ...session, groupIndex, phraseIndex, phase: "ready", pausedPhase: "loading", completedCycles: 0, confirmedCycles: 0, cycleTarget: 3,
      attempt: session.attempt + 1, remainingMs: 0, subtitlesRevealed: false, groupDurationMs: 0 };
  }
  if (session.phase === "completed") return session;
  switch (event.type) {
    case "reveal-subtitles":
      return session.level === 3 || session.level === 5 ? { ...session, subtitlesRevealed: true } : session;
    case "pause":
      if (session.phase === "ready" && session.completedCycles === 0) return session;
      if (!["ready", "loading", "playing", "gap", "speaking", "countdown"].includes(session.phase)) return session;
      return { ...session, phase: "paused", pausedPhase: session.phase as ActivePhase | "ready" };
    case "previous":
      if (session.groupIndex === 0) return session;
      return {
        ...session, groupIndex: session.groupIndex - 1,
        phraseIndex: groupFirstPhrase(session) - session.groupSizes[session.groupIndex - 1],
        completedCycles: 0, confirmedCycles: 0, cycleTarget: 3, phase: "ready", attempt: session.attempt + 1, remainingMs: 0, subtitlesRevealed: false, groupDurationMs: 0
      };
    case "next":
      if (session.mode === "manual" && session.completedCycles >= session.cycleTarget && session.confirmedCycles < session.cycleTarget
        && (session.phase === "ready" || (session.phase === "paused" && session.pausedPhase === "ready"))) return confirmListen(session);
      return session.confirmedCycles >= session.cycleTarget ? requestAdvance(session) : session;
    case "space":
      if (session.phase === "error") return startListen(session);
      if (["loading", "playing", "gap"].includes(session.phase)) {
        return { ...session, phase: "paused", pausedPhase: session.phase as ActivePhase };
      }
      if (session.phase === "paused") {
        if (session.pausedPhase === "ready") return transitionAudioSession({ ...session, phase: "ready" }, event);
        return { ...session, phase: session.pausedPhase === "playing" ? "loading" : session.pausedPhase };
      }
      if (session.mode === "manual" && session.completedCycles > session.confirmedCycles && session.phase === "ready") {
        const confirmed = confirmListen(session);
        return confirmed.confirmedCycles >= confirmed.cycleTarget ? confirmed : startListen(confirmed);
      }
      if (session.confirmedCycles >= session.cycleTarget) return requestAdvance(session);
      return startListen(session);
    case "retry":
      if (session.confirmedCycles >= 5) return requestAdvance(session);
      return startListen({ ...session, cycleTarget: session.confirmedCycles >= 3 ? 5 : session.cycleTarget });
    case "audio-playing":
      if (event.attempt !== session.attempt || session.phase !== "loading") return session;
      return { ...session, phase: "playing" };
    case "audio-ended": {
      if (event.attempt !== session.attempt || session.phase !== "playing") return session;
      const groupDurationMs = session.groupDurationMs + event.durationMs;
      if (session.phraseIndex + 1 < groupFirstPhrase(session) + session.groupSizes[session.groupIndex]) {
        return { ...session, phase: "gap", groupDurationMs, remainingMs: session.groupGapMs };
      }
      return {
        ...session,
        groupDurationMs,
        phase: session.mode === "automatic" ? "speaking" : "ready",
        completedCycles: session.completedCycles + 1,
        remainingMs: session.mode === "automatic"
          ? speakingTime(session, groupDurationMs)
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
      const confirmed = confirmListen(session);
      if (confirmed.confirmedCycles < confirmed.cycleTarget) return startListen(confirmed);
      if (confirmed.cycleTarget === 5) return requestAdvance(confirmed);
      return confirmed;
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
      if (next.mode === "manual" && hasSessionTimer(session)) return {
        ...next, phase: session.phase === "paused" ? "paused" : "ready", pausedPhase: "ready", remainingMs: 0
      };
      if (next.mode === "automatic" && session.mode === "manual" && next.completedCycles > next.confirmedCycles
        && (session.phase === "ready" || (session.phase === "paused" && session.pausedPhase === "ready"))) {
        return { ...next, phase: session.phase === "paused" ? "paused" : "speaking", pausedPhase: "speaking", remainingMs: speakingTime(next) };
      }
      return next;
    }
  }
}
