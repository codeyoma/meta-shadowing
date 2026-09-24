import learningAudio from '../../modules/learning-audio';
import { videoPlayback } from '@/core/video-playback';
import { configureLessonAudio } from './voice-monitor';

export function nativeVideo(owner: string, monitorKey: string | undefined, ended: (duration: number) => void,
  failed: () => void, interrupted: () => void, durations: number[], sourceIndices: readonly (readonly number[])[]) {
  if (!learningAudio?.videoPrepare) throw Error('Video unavailable.');
  const module = learningAudio;
  let request = 0;
  function unitMembers(unit: number) {
    const members = sourceIndices[unit];
    if (!Number.isInteger(unit) || !members?.length || members.length > 4) throw Error('Unknown learning unit.');
    if (members.some((index, offset) => !Number.isInteger(index) || index < 0 ||
      (offset > 0 && index <= members[offset - 1]!) || !Number.isFinite(durations[index]) || durations[index]! <= 0)) {
      throw Error('Invalid video learning unit.');
    }
    return [...members];
  }
  const port = videoPlayback(owner, {
    async prepare(key, generation, phrase, position, rate) {
      const members = unitMembers(phrase);
      const current = ++request;
      await configureLessonAudio(monitorKey);
      if (current !== request) throw Error('Video cancelled.');
      await module.videoPrepare(key, generation, members, position, rate);
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
    const total = unitMembers(phrase).reduce((sum, index) => sum + durations[index]!, 0);
    return port.prepare(phrase, Math.max(0, total - 0.001), rate);
  } };
}
export function disposeVideo(owner: string) { void learningAudio?.videoDispose(owner).catch(() => {}); }
