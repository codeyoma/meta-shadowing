import { AppState } from 'react-native';
import { impactAsync, ImpactFeedbackStyle } from 'expo-haptics';
import { createTapFeedback } from '@/core/tap-feedback';
import type { HapticPulse } from '@/core/cycle-haptics';
import LearningHaptics from '../../modules/learning-haptics/src/LearningHapticsModule';

export function hapticsEnabled() { return LearningHaptics.isEnabled(); }
export const setHapticsEnabled = (enabled: boolean) => LearningHaptics.setEnabled(enabled);

function optional(effect: () => Promise<void>) {
  try { void effect().catch(() => {}); } catch { /* Feedback cannot affect learning or saving. */ }
}

export function prepareLearningHaptics() {
  if (AppState.currentState === 'active') optional(() => LearningHaptics.prepare());
}
export function stopLearningHaptics() { optional(() => LearningHaptics.stop()); }

export const tapFeedback = createTapFeedback({
  active: () => AppState.currentState === 'active',
  haptic: () => hapticsEnabled() ? impactAsync(ImpactFeedbackStyle.Light) : undefined,
});

export function learningHaptic(pulses: HapticPulse[]) {
  if (AppState.currentState !== 'active') return;
  optional(() => LearningHaptics.play(pulses));
}
