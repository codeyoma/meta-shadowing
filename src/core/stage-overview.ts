import type { Session } from './session';

export type StageRecord = { stage: number; count: number; session: Session | null };
function requiredRuns(stage: number) { return stage <= 10 ? 2 : 3; }
export function stageStars(record: StageRecord): boolean[] {
  return Array.from({ length: requiredRuns(record.stage) }, (_, index) => record.count > index);
}
export function stageComplete(record: StageRecord) {
  return record.count >= requiredRuns(record.stage);
}
export function canOpenStage(stage: number, records: readonly StageRecord[]) {
  if (stage !== 1 && stage !== 2) return false;
  return stage === 1 || records.some(r => r.stage === 1 && stageComplete(r));
}
export function stageOverview(records: readonly StageRecord[]) {
  const completed = new Set(records.filter(r => r.stage >= 1 && r.stage <= 16 && stageComplete(r)).map(r => r.stage)).size;
  const playable = records.filter(r => canOpenStage(r.stage, records)).sort((a, b) => a.stage - b.stage);
  const current = playable.find(r => !stageComplete(r))?.stage
    ?? playable.find(r => r.session && r.session.phase !== 'complete')?.stage ?? 1;
  return { completed, total: 16, percent: Math.round(completed / 16 * 100), current };
}

export function bookAction(owned: boolean, installed: boolean) {
  return !owned ? 'purchase' : !installed ? 'download' : 'resume';
}
