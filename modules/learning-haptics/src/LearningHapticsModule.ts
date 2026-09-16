import { NativeModule, requireNativeModule } from 'expo';
import type { HapticPulse } from '../../../src/core/cycle-haptics';

declare class LearningHapticsModule extends NativeModule {
  isEnabled(): boolean;
  setEnabled(enabled: boolean): Promise<void>;
  prepare(): Promise<void>;
  play(pulses: HapticPulse[]): Promise<void>;
  stop(): Promise<void>;
}

export default requireNativeModule<LearningHapticsModule>('LearningHaptics');
