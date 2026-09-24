import learningAudio from '../../modules/learning-audio';
import { videoPlayback } from '@/core/video-playback';
import { configureLessonAudio } from './voice-monitor';

export function nativeVideo(owner: string, monitorKey: string | undefined, ended: (duration: number) => void,
  failed: () => void, interrupted: () => void, durations: number[]) {
  if (!learningAudio?.videoPrepare) throw Error('Video unavailable.');
  const module = learningAudio;
  let request = 0;
  const port = videoPlayback(owner, {
    async prepare(key, generation, phrase, position, rate) {
      const current = ++request;
      await configureLessonAudio(monitorKey);
      if (current !== request) throw Error('Video cancelled.');
      await module.videoPrepare(key, generation, phrase, position, rate);
    },
    play(key, generation) {
      const current = request;
      void module.videoPlay(key, generation).catch(() => { if (current === request) failed(); });
    },
    pause(key) { request++; void module.videoPause(key).catch(() => {}); },
    // Focus cleanup retires this adapter, but the mounted surface keeps its frame.
    dispose(key) { request++; void module.videoPause(key).catch(() => {}); },
    subscribe: listener => module.addListener('onVideoStatus', listener),
  }, ended, failed, interrupted);
  return { ...port, restoreFrame(phrase: number, rate: number) {
    // Seek inside the final frame, not into the next phrase at the end boundary.
    return port.prepare(phrase, Math.max(0, durations[phrase]! - 0.001), rate);
  } };
}
export function disposeVideo(owner: string) { void learningAudio?.videoDispose(owner).catch(() => {}); }
