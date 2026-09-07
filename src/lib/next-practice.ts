import type { Lesson } from "./lessons";
import type { CompletionRecord, ProgressRecord } from "./learning-records";
import { completedStagesForLesson } from "./learning-records";
import { learningStages, stageForLevel } from "./learning-stages";

export function nextPracticeForLesson(journal: { progress: ProgressRecord | null; history: CompletionRecord[] }, lesson: Lesson): { stage: number; progress: ProgressRecord | null; review: boolean } {
  const saved = journal.progress;
  if (saved && saved.lessonId === lesson.id && saved.lessonVersion === lesson.version
    && saved.nextPhrase < lesson.phraseCount && saved.nextUnit < lesson.phraseCount
    && !journal.history.some(record => record.runId === saved.runId)) {
    return { stage: stageForLevel(saved.level, saved.stage), progress: saved, review: false };
  }
  const completed = completedStagesForLesson(journal.history, lesson);
  const next = learningStages.find(item => !completed.includes(item.stage));
  return { stage: next?.stage ?? 1, progress: null, review: !next };
}
