import { createAudioPlayer, setAudioModeAsync } from 'expo-audio';
import { audioPort } from '../core/audio';
import { audioUri } from './package';

export function nativeAudio(ended: (duration: number) => void, failed: () => void, interrupted: () => void) {
  return audioPort(() => setAudioModeAsync({ playsInSilentMode: true, shouldPlayInBackground: false,
    allowsRecording: false, interruptionMode: 'doNotMix' }), phrase => {
    const player = createAudioPlayer({ uri: audioUri(phrase) }, { updateInterval: 200 });
    return {
      get currentTime() { return player.currentTime; },
      get duration() { return player.duration; },
      get currentStatus() { return player.currentStatus; },
      setPlaybackRate: rate => player.setPlaybackRate(rate),
      seekTo: seconds => player.seekTo(seconds, 0, 0),
      play: () => player.play(),
      remove: () => { player.pause(); player.remove(); player.release(); },
      onStatus: callback => player.addListener('playbackStatusUpdate', callback),
    };
  }, ended, failed, interrupted);
}
