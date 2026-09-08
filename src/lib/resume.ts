import { type GroupSize } from "./phrase-groups";
import { isStageForLevel } from "./learning-stages";
import { normalizeRapidSettings, type RapidSettings } from "./rapid-session";
import { type Language } from "./languages";


export type SessionSelection = {
  language: Language;
  lessonId: string;
  level: number;
  stage?: number;
  mode: "manual" | "automatic";
  display: "current" | "cumulative";
  speed: number;
  advanceDelayMs?: number;
  groupSize?: GroupSize;
  wpmLevel?: RapidSettings["wpmLevel"];
  speakingExtraMs?: number;
  lineGapMs?: number;
  sectionGapMs?: number;
  groupGapMs?: number;
  runId?: string;
};

export function getPlayerHref(selection: SessionSelection): string {
  const params = new URLSearchParams({
    lesson: selection.lessonId,
    level: String(selection.level),
    mode: selection.mode
  });
  if (isStageForLevel(selection.stage, selection.level)) params.set("stage", String(selection.stage));
  if (selection.level >= 6) {
    const settings = normalizeRapidSettings(selection);
    params.set("display", settings.display);
    params.set("wpm", String(settings.wpmLevel));
    params.set("speak", String(settings.speakingExtraMs / 1000));
    params.set("lineGap", String(settings.lineGapMs / 1000));
    params.set("sectionGap", String(settings.sectionGapMs / 1000));
  } else {
    params.set("speed", String(selection.speed));
    params.set("gap", String((selection.advanceDelayMs ?? 1000) / 1000));
  }
  if (selection.level === 4 || selection.level === 5) params.set("group", String(selection.groupSize ?? 2));
  if (selection.groupGapMs !== undefined && selection.level <= 5) params.set("groupGap", String(selection.groupGapMs / 1000));
  if (selection.runId) params.set("run", selection.runId);
  return `/player?${params}`;
}
