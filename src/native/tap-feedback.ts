import { AppState } from 'react-native';
import { impactAsync, ImpactFeedbackStyle, notificationAsync, NotificationFeedbackType } from 'expo-haptics';
import { createTapFeedback } from '@/core/tap-feedback';
import type { LearningFeedback } from '@/core/learning-feedback';

export const tapFeedback = createTapFeedback({
  active: () => AppState.currentState === 'active',
  haptic: () => impactAsync(ImpactFeedbackStyle.Light),
});

export function learningHaptic(event: LearningFeedback) {
  if (AppState.currentState !== 'active') return;
  try {
    const effect = event === 'complete' ? notificationAsync(NotificationFeedbackType.Success)
      : impactAsync(event === 'next' ? ImpactFeedbackStyle.Medium : ImpactFeedbackStyle.Light);
    void effect.catch(() => {});
  } catch { /* Feedback must never affect learning or saving. */ }
}
