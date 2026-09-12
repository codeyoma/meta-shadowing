import { AppState } from 'react-native';
import { createAudioPlayer } from 'expo-audio';
import { impactAsync, ImpactFeedbackStyle } from 'expo-haptics';
import { createTapFeedback, createTapSound } from '@/core/tap-feedback';

const sound = createTapSound(() => {
  const player = createAudioPlayer(require('../../assets/sounds/button-soft-tick.wav'), { updateInterval: 500 });
  player.volume = 0.65;
  return {
    loaded: () => player.isLoaded,
    seek: () => player.seekTo(0, 0, 0),
    play: () => { if (AppState.currentState === 'active') player.play(); },
    release: () => { player.pause(); player.remove(); player.release(); },
  };
});

export function startTapFeedback() {
  if (AppState.currentState === 'active') sound.activate();
  const subscription = AppState.addEventListener('change', state => {
    if (state === 'active') sound.activate(); else sound.deactivate();
  });
  return () => { subscription.remove(); sound.deactivate(); };
}

export const tapFeedback = createTapFeedback({
  active: () => AppState.currentState === 'active',
  haptic: () => impactAsync(ImpactFeedbackStyle.Light),
  sound: sound.play,
});
