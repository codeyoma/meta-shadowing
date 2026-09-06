export type RapidLine = {
  target: readonly string[];
  korean: readonly string[];
  chapter: { target: string; korean: string } | null;
  boundary: "chapter" | "section" | null;
};

export const RAPID_WPM = { 3: 200, 4: 267, 5: 333, 6: 400 } as const;
export type RapidSettings = {
  wpmLevel: keyof typeof RAPID_WPM;
  speakingExtraMs: number;
  lineGapMs: number;
  sectionGapMs: number;
  mode: "manual" | "automatic";
  display: "current" | "cumulative";
};
export const DEFAULT_RAPID_SETTINGS: RapidSettings = {
  wpmLevel: 3, speakingExtraMs: 500, lineGapMs: 1000, sectionGapMs: 2000, mode: "manual", display: "current"
};

export function isWpmLevel(value: unknown): value is RapidSettings["wpmLevel"] {
  return value === 3 || value === 4 || value === 5 || value === 6;
}

export function isRapidDelay(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 && value <= 30000;
}

export function normalizeRapidSettings(settings: Partial<RapidSettings>, fallback = DEFAULT_RAPID_SETTINGS): RapidSettings {
  return {
    wpmLevel: isWpmLevel(settings.wpmLevel) ? settings.wpmLevel : fallback.wpmLevel,
    mode: settings.mode === "manual" || settings.mode === "automatic" ? settings.mode : fallback.mode,
    display: settings.display === "current" || settings.display === "cumulative" ? settings.display : fallback.display,
    speakingExtraMs: isRapidDelay(settings.speakingExtraMs) ? settings.speakingExtraMs : fallback.speakingExtraMs,
    lineGapMs: isRapidDelay(settings.lineGapMs) ? settings.lineGapMs : fallback.lineGapMs,
    sectionGapMs: isRapidDelay(settings.sectionGapMs) ? settings.sectionGapMs : fallback.sectionGapMs
  };
}
export type RapidLevel = 6 | 7 | 8;

export type RapidSession = {
  lines: readonly RapidLine[];
  level: RapidLevel;
  settings: RapidSettings;
  lineIndex: number;
  tokenIndex: number;
  phase: "ready" | "target" | "korean" | "speaking" | "gap" | "line-complete" | "completed";
  remainingMs: number;
  runId: number;
  paused: boolean;
};

export type RapidEvent = { type: "space" | "pause" | "restart" | "previous" | "next" }
  | { type: "tick"; elapsedMs: number; runId: number }
  | { type: "settings"; settings: Partial<RapidSettings> };

export function createRapidSession({ lines, level, settings = {} }: { lines: readonly RapidLine[]; level: RapidLevel; settings?: Partial<RapidSettings> }): RapidSession {
  return { lines, level, settings: normalizeRapidSettings(settings), lineIndex: 0, tokenIndex: 0, phase: lines.length ? "ready" : "completed", remainingMs: 0, runId: 0, paused: false };
}

function isActive(session: RapidSession) {
  return session.phase === "target" || session.phase === "korean" || session.phase === "speaking" || session.phase === "gap";
}

export function isRapidRunning(session: RapidSession) {
  return isActive(session) && !session.paused;
}

function startLine(session: RapidSession, lineIndex: number): RapidSession {
  return { ...session, lineIndex, phase: session.level === 6 ? "target" : "korean", tokenIndex: 0, remainingMs: 60000 / RAPID_WPM[session.settings.wpmLevel], runId: session.runId + 1, paused: false };
}

function stageDuration(session: RapidSession): number {
  const tokenMs = 60000 / RAPID_WPM[session.settings.wpmLevel];
  if (session.phase === "speaking") return session.lines[session.lineIndex].target.length * tokenMs + session.settings.speakingExtraMs;
  if (session.phase === "gap") return session.lines[session.lineIndex + 1].boundary ? session.settings.sectionGapMs : session.settings.lineGapMs;
  return tokenMs;
}

export function transitionRapidSession(session: RapidSession, event: RapidEvent): RapidSession {
  const tokenMs = 60000 / RAPID_WPM[session.settings.wpmLevel];
  if (!session.lines.length) return session;
  if (event.type === "settings") {
    const next = { ...session, settings: normalizeRapidSettings(event.settings, session.settings), runId: session.runId + 1 };
    if (next.settings.mode === "manual" && next.phase === "gap") return { ...next, phase: "line-complete", remainingMs: 0, paused: false };
    const duration = stageDuration(session);
    return isActive(session) ? { ...next, remainingMs: duration ? session.remainingMs / duration * stageDuration(next) : 0 } : next;
  }
  if (event.type === "pause") return isRapidRunning(session) ? { ...session, paused: true, runId: session.runId + 1 } : session;
  if (event.type === "restart") return startLine(session, session.lineIndex);
  if (event.type === "previous" || event.type === "next") {
    const lineIndex = session.lineIndex + (event.type === "next" ? 1 : -1);
    if (lineIndex < 0 || lineIndex >= session.lines.length) return session;
    const next = startLine(session, lineIndex);
    return isActive(session) ? { ...next, paused: session.paused } : { ...next, phase: "ready", remainingMs: 0 };
  }
  if (event.type === "space") {
    if (isActive(session)) return { ...session, paused: !session.paused, runId: session.runId + 1 };
    if (session.phase === "completed") return session;
    const lineIndex = session.lineIndex + (session.phase === "line-complete" ? 1 : 0);
    return startLine(session, lineIndex);
  }
  if (event.type !== "tick" || !isRapidRunning(session) || event.runId !== session.runId || !Number.isFinite(event.elapsedMs) || event.elapsedMs <= 0) return session;
  let next = session;
  let elapsedMs = event.elapsedMs;
  while (next.phase === "target" || next.phase === "korean" || next.phase === "speaking" || next.phase === "gap") {
    if (elapsedMs + 1e-7 < next.remainingMs) return { ...next, remainingMs: next.remainingMs - elapsedMs };
    elapsedMs -= next.remainingMs;
    if (next.phase === "gap") {
      next = startLine(next, next.lineIndex + 1);
      continue;
    }
    const line = next.lines[next.lineIndex];
    if (next.phase !== "speaking" && next.tokenIndex + 1 < line[next.phase].length) {
      next = { ...next, tokenIndex: next.tokenIndex + 1, remainingMs: tokenMs };
    } else if (next.phase === "target" && next.level === 6) {
      next = { ...next, phase: "korean", tokenIndex: 0, remainingMs: tokenMs };
    } else if (next.phase === "korean" && next.level !== 6) {
      next = { ...next, phase: "speaking", tokenIndex: 0, remainingMs: line.target.length * tokenMs + next.settings.speakingExtraMs };
    } else if (next.phase === "speaking" && next.level === 7) {
      next = { ...next, phase: "target", tokenIndex: 0, remainingMs: tokenMs };
    } else {
      const following = next.lines[next.lineIndex + 1];
      if (!following) next = { ...next, phase: "completed", remainingMs: 0 };
      else if (next.settings.mode === "manual") next = { ...next, phase: "line-complete", remainingMs: 0 };
      else next = { ...next, phase: "gap", remainingMs: following.boundary ? next.settings.sectionGapMs : next.settings.lineGapMs };
    }
  }
  return next;
}

export function rapidDisplay(session: RapidSession): { text: string; language: "target" | "korean"; position: number; count: number } | null {
  if (session.phase !== "target" && session.phase !== "korean") return null;
  const tokens = session.lines[session.lineIndex][session.phase];
  return { text: session.settings.display === "cumulative" ? tokens.slice(0, session.tokenIndex + 1).join(" ") : tokens[session.tokenIndex], language: session.phase, position: session.tokenIndex + 1, count: tokens.length };
}
