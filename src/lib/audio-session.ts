type ActivePhase = "loading" | "playing" | "speaking" | "countdown";

export type AudioPracticeLevel = 1 | 2 | 3;

export const PLAYBACK_RATES = [0.5, 0.75, 1, 1.25, 1.5, 1.75, 2, 2.25, 2.5, 2.75, 3];

export type AudioSessionSettings = {
  mode: "manual" | "automatic";
  playbackRate: number;
  advanceDelayMs: number;
};

export type AudioSession = {
  level: AudioPracticeLevel;
  subtitlesRevealed: boolean;
  phraseCount: number;
  phraseIndex: number;
  completedCycles: number;
  attempt: number;
  phase: "ready" | ActivePhase | "paused" | "error" | "completed";
  pausedPhase: ActivePhase;
  mode: "manual" | "automatic";
  playbackRate: number;
  advanceDelayMs: number;
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
  phraseCount, level = 1, mode = "manual", advanceDelayMs = 1000, playbackRate = 1
}: { phraseCount: number; level?: AudioPracticeLevel } & Partial<AudioSessionSettings>): AudioSession {
  return {
    level, subtitlesRevealed: false, phraseCount, phraseIndex: 0, completedCycles: 0, attempt: 0, phase: "ready",
    pausedPhase: "loading", mode, remainingMs: 0,
    advanceDelayMs: Number.isFinite(advanceDelayMs) && advanceDelayMs >= 0 && advanceDelayMs <= 30000 ? advanceDelayMs : 1000,
    playbackRate: PLAYBACK_RATES.includes(playbackRate) ? playbackRate : 1
  };
}

function startListen(session: AudioSession): AudioSession {
  const startsNewCycle = session.phase === "ready" || hasSessionTimer(session);
  return {
    ...session, phase: "loading", attempt: session.attempt + 1, remainingMs: 0,
    subtitlesRevealed: startsNewCycle ? false : session.subtitlesRevealed
  };
}

function advancePhrase(session: AudioSession): AudioSession {
  if (session.phraseIndex + 1 >= session.phraseCount) return { ...session, phase: "completed", attempt: session.attempt + 1 };
  const next: AudioSession = { ...session, phase: "ready", phraseIndex: session.phraseIndex + 1, completedCycles: 0, attempt: session.attempt + 1, remainingMs: 0, subtitlesRevealed: false };
  return session.mode === "automatic" ? startListen(next) : next;
}

export function transitionAudioSession(session: AudioSession, event: AudioSessionEvent): AudioSession {
  if (session.phase === "completed") return session;
  switch (event.type) {
    case "reveal-subtitles":
      return session.level === 3 ? { ...session, subtitlesRevealed: true } : session;
    case "pause":
      if (!["loading", "playing", "speaking", "countdown"].includes(session.phase)) return session;
      return { ...session, phase: "paused", pausedPhase: session.phase as ActivePhase };
    case "previous":
      if (session.phraseIndex === 0) return session;
      return { ...session, phraseIndex: session.phraseIndex - 1, completedCycles: 0, phase: "ready", attempt: session.attempt + 1, remainingMs: 0, subtitlesRevealed: false };
    case "next":
      return session.completedCycles >= 3 ? advancePhrase(session) : session;
    case "space":
      if (session.phase === "error") return startListen(session);
      if (["loading", "playing"].includes(session.phase)) {
        return { ...session, phase: "paused", pausedPhase: session.phase as ActivePhase };
      }
      if (session.phase === "paused") {
        return { ...session, phase: session.pausedPhase === "playing" ? "loading" : session.pausedPhase };
      }
      if (session.completedCycles >= 3) return advancePhrase(session);
      return startListen(session);
    case "retry":
      if (session.completedCycles >= 5) return advancePhrase(session);
      return startListen(session);
    case "audio-playing":
      if (event.attempt !== session.attempt || session.phase !== "loading") return session;
      return { ...session, phase: "playing" };
    case "audio-ended": {
      if (event.attempt !== session.attempt || session.phase !== "playing") return session;
      const speakingWindow = session.level === 2
        ? { multiplier: 2.25, paddingMs: 750 }
        : { multiplier: 1.25, paddingMs: 500 };
      return {
        ...session,
        phase: session.mode === "automatic" ? "speaking" : "ready",
        completedCycles: session.completedCycles + 1,
        remainingMs: session.mode === "automatic"
          ? event.durationMs / session.playbackRate * speakingWindow.multiplier + speakingWindow.paddingMs
          : 0
      };
    }
    case "audio-error":
      if (event.attempt !== session.attempt || !["loading", "playing", "paused"].includes(session.phase)) return session;
      return { ...session, phase: "error" };
    case "tick": {
      if (event.attempt !== session.attempt || !["speaking", "countdown"].includes(session.phase)) return session;
      const remainingMs = Math.max(0, session.remainingMs - event.elapsedMs);
      if (remainingMs > 0) return { ...session, remainingMs };
      if (session.phase === "countdown") return advancePhrase(session);
      if (session.completedCycles < 3) return startListen(session);
      return { ...session, phase: "countdown", remainingMs: session.advanceDelayMs };
    }
    case "settings": {
      const next = {
        ...session,
        mode: event.mode ?? session.mode,
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
