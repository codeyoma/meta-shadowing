import type { LearningContext } from './learning-context';
import type { PlayableStage } from './catalog';
import { readSentenceAnalysis } from './sentence-analysis';

export type AnalysisScope = { stage: PlayableStage; run: string; phrase: number };
/** Read-only reference access; no reveal restriction, checkpoint writes or rewards. */
export async function loadCurrentAnalysis(context: LearningContext, scope: AnalysisScope,
  authorized: () => boolean, read: () => Promise<string | null>) {
  const current = () => {
    if (!authorized()) return null;
    const saved = context.load(scope.stage);
    return saved?.runId === scope.run && saved.phrase === scope.phrase ? saved : null;
  };
  const saved = current();
  if (!saved) return null;
  const unit = context.units(saved)[scope.phrase];
  if (!unit) return null;
  const raw = await read();
  const latest = current();
  if (!raw || !latest || JSON.stringify(context.units(latest)[scope.phrase]?.sourceIndices) !== JSON.stringify(unit.sourceIndices)) return null;
  // Current installed syntax packages are English. Unknown languages fail closed.
  const language = context.pack.language === 'english' ? 'en' : context.pack.language;
  return readSentenceAnalysis(raw, context.pack.manifest.phrases, language, unit.sourceIndices);
}
