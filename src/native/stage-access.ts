import learningAudio from '../../modules/learning-audio';
import { resolveTestStageAccess } from '../core/stage-access';

export const testStageAccess = (): Promise<boolean> =>
  resolveTestStageAccess(learningAudio ? () => learningAudio!.testStageAccess() : undefined);
