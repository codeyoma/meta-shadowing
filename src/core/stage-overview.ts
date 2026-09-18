import type { Session } from './session';
import { isPlayableStage } from './catalog';

export type StageRecord = { stage: number; count: number; session: Session | null };
const requiredRuns = 3;
export function stageStars(record: StageRecord): boolean[] {
  return Array.from({ length: requiredRuns }, (_, index) => record.count > index);
}
export function stageComplete(record: StageRecord) {
  return record.count >= requiredRuns;
}
export function canOpenStage(stage: number, records: readonly StageRecord[], bypass = false) {
  if (!isPlayableStage(stage)) return false;
  return bypass || stage === 1 || records.some(r => r.stage === stage - 1 && stageComplete(r));
}
export function stageOverview(records: readonly StageRecord[], latestStage: number | null = null, bypass = false) {
  const completed = new Set(records.filter(r => r.stage >= 1 && r.stage <= 16 && stageComplete(r)).map(r => r.stage)).size;
  const playable = records.filter(r => canOpenStage(r.stage, records)).sort((a, b) => a.stage - b.stage);
  const latest = records.find(r => r.stage === latestStage && r.session && r.session.phase !== 'complete'
    && canOpenStage(r.stage, records, bypass));
  const current = latest?.stage ?? playable.find(r => !stageComplete(r))?.stage
    ?? playable.find(r => r.session && r.session.phase !== 'complete')?.stage ?? 1;
  return { completed, total: 16, percent: Math.round(completed / 16 * 100), current };
}

export function bookAction(owned: boolean, installed: boolean) {
  return !owned ? 'purchase' : !installed ? 'download' : 'resume';
}
