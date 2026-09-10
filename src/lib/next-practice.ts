import type { Lesson } from "./lessons";
import type { CompletionRecord, ProgressRecord } from "./learning-records";
import { completedStagesForLesson } from "./learning-records";
import { learningStages, stageForLevel } from "./learning-stages";

export function nextPracticeForLesson(journal: { progress: ProgressRecord | null; history: CompletionRecord[]; localProgress?: ProgressRecord[] }, lesson: Lesson, selectedStage?: number): { stage: number; progress: ProgressRecord | null; review: boolean } {
  const eligible = (saved: ProgressRecord) => saved.lessonId === lesson.id && saved.lessonVersion === lesson.version
    && saved.nextPhrase < lesson.phraseCount && saved.nextUnit < lesson.phraseCount
    && !journal.history.some(record => record.runId === saved.runId)
    && (selectedStage === undefined || stageForLevel(saved.level, saved.stage) === selectedStage);
  // Preserve the existing higher-level resume first. Independent local stages
  // remain available to explicit previews, ordered by stage/run identity, not insertion.
  const local = (journal.localProgress ?? []).filter(eligible).sort((a, b) =>
    stageForLevel(a.level, a.stage) - stageForLevel(b.level, b.stage) || a.runId.localeCompare(b.runId));
  const saved = journal.progress && eligible(journal.progress) ? journal.progress : local[0];
  if (saved) {
    return { stage: stageForLevel(saved.level, saved.stage), progress: saved, review: false };
  }
  const completed = completedStagesForLesson(journal.history, lesson);
  if (selectedStage !== undefined) return { stage: selectedStage, progress: null, review: completed.includes(selectedStage) };
  const next = learningStages.find(item => !completed.includes(item.stage));
  return { stage: next?.stage ?? 1, progress: null, review: !next };
}
