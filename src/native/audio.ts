import { createAudioPlayer, createAudioPlaylist, setAudioModeAsync } from 'expo-audio';
import { audioPort } from '../core/audio';
import { playlistHandle } from '../core/playlist-audio';
import { audioUri } from './package';
import type { LearningPackage } from '@/core/learning-context';
import learningAudio from '../../modules/learning-audio';
import { mayUsePackage } from './paid-package';

export function nativeAudio(pack: LearningPackage, ended: (duration: number) => void, failed: () => void,
  interrupted: () => void, sourceIndices?: readonly (readonly number[])[]) {
  return audioPort(() => setAudioModeAsync({ playsInSilentMode: true, shouldPlayInBackground: false,
    allowsRecording: false, interruptionMode: 'doNotMix' }), async phrase => {
    const authorize = () => {if (!mayUsePackage(pack)) throw Error('package-delivery-unauthorized');};
    authorize();
    const members = sourceIndices ? sourceIndices[phrase] : [phrase];
    if (!members?.length || members.length > 4) throw Error('Unknown learning unit.');
    const uris = members.map(index => audioUri(pack, index));
    if (uris.length > 1 && !learningAudio) throw Error('Continuous audio is unavailable.');
    if (uris.length > 1) {
      const durations = await learningAudio!.durations(uris);
      authorize();
      const queue = createAudioPlaylist({ sources: uris.map(uri => ({ uri })), loop: 'none', updateInterval: 200 });
      try {
        return playlistHandle({
          get currentIndex() { return queue.currentIndex; },
          get currentTime() { return queue.currentTime; },
          get currentStatus() { return queue.currentStatus; },
          get playbackRate() { return queue.playbackRate; },
          set playbackRate(rate) { queue.playbackRate = rate; },
          skipTo: index => queue.skipTo(index), seekTo: seconds => queue.seekTo(seconds),
          play: () => {authorize();queue.play();}, pause: () => queue.pause(), destroy: () => queue.destroy(),
          release: () => queue.release(), onStatus: callback => queue.addListener('playlistStatusUpdate', callback),
        }, durations);
      } catch (error) { queue.pause(); queue.destroy(); queue.release(); throw error; }
    }
    const player = createAudioPlayer({ uri: uris[0]! }, { updateInterval: 200 });
    return {
      get currentTime() { return player.currentTime; },
      get duration() { return player.duration; },
      get currentStatus() { return player.currentStatus; },
      setPlaybackRate: rate => player.setPlaybackRate(rate),
      seekTo: seconds => player.seekTo(seconds, 0, 0),
      play: () => {authorize();player.play();},
      remove: () => { player.pause(); player.remove(); player.release(); },
      onStatus: callback => player.addListener('playbackStatusUpdate', callback),
    };
  }, ended, failed, interrupted);
}
