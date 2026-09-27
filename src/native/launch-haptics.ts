import { AppState } from 'react-native';
import LearningHaptics from '../../modules/learning-haptics/src/LearningHapticsModule';

function optional(effect: () => Promise<void>) {
  try { void effect().catch(() => {}); }
  catch { /* Decorative feedback must never delay or prevent app launch. */ }
}

function whenActive(effect: () => Promise<void>) {
  optional(async () => {
    if (AppState.currentState === 'active') await effect();
  });
}

export function prepareLaunchHaptics() { whenActive(() => LearningHaptics.prepareLaunch()); }
export function playLaunchHaptics() { whenActive(() => LearningHaptics.playLaunch()); }
export function stopLaunchHaptics() { optional(() => LearningHaptics.stopLaunch()); }
