import { requireOptionalNativeModule } from 'expo';

interface LearningAudio {
  durations(uris: string[]): Promise<number[]>;
  testStageAccess(): Promise<boolean>;
}
export default requireOptionalNativeModule<LearningAudio>('LearningAudio');
