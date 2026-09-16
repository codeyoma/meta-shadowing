import type { NativeHandle, NativeStatus } from './audio';

/** The small native boundary needed from Expo's AVQueuePlayer-backed playlist. */
export type PlaylistStatus = {
  currentIndex: number; currentTime: number; isLoaded: boolean; playing: boolean; didJustFinish: boolean;
  error?: string | null; playbackInterrupted?: boolean; mediaServicesDidReset?: boolean;
};
export interface PlaylistPort {
  readonly currentIndex: number; readonly currentTime: number; readonly currentStatus: PlaylistStatus;
  playbackRate: number;
  skipTo(index: number): void; seekTo(seconds: number): Promise<void>;
  play(): void; pause(): void; destroy(): void; release(): void;
  onStatus(callback: (status: PlaylistStatus) => void): { remove(): void };
}

export function playlistHandle(queue: PlaylistPort, durations: readonly number[]): NativeHandle {
  if (durations.length < 2 || durations.length > 4 || durations.some(value => !Number.isFinite(value) || value <= 0)) {
    throw Error('Invalid audio timeline.');
  }
  const offsets = durations.map((_, index) => durations.slice(0, index).reduce((a, b) => a + b, 0));
  const duration = durations.reduce((a, b) => a + b, 0);
  let requested = false, finished = false, removed = false;
  let position = 0;
  function normalized(s: PlaylistStatus): NativeStatus {
    const final = s.didJustFinish && s.currentIndex === durations.length - 1;
    if (final) finished = true;
    return { isLoaded: s.isLoaded, duration, didJustFinish: final,
      // AVQueuePlayer emits transient paused/nil-item statuses as it advances/drains.
      // Explicit pause/error events, patched into the native boundary, end this logical playback.
      playing: requested && !final && !s.playbackInterrupted && !s.error,
      error: s.error ?? null, interrupted: s.playbackInterrupted,
      mediaServicesDidReset: s.mediaServicesDidReset };
  }
  return {
    get currentTime() {
      if (finished) return duration;
      const index = Math.max(0, Math.min(queue.currentIndex, durations.length - 1));
      position = Math.max(position, offsets[index]! + Math.max(0, Math.min(queue.currentTime, durations[index]!)));
      return position;
    },
    duration,
    get currentStatus() { return normalized(queue.currentStatus); },
    setPlaybackRate(rate) { queue.playbackRate = rate; },
    async seekTo(seconds) {
      if (removed) throw Error('Audio preparation cancelled.');
      position = Math.max(0, Math.min(seconds, duration));
      let index = 0;
      while (index < durations.length - 1 && position >= offsets[index + 1]!) index++;
      if (index !== queue.currentIndex) queue.skipTo(index);
      await queue.seekTo(position - offsets[index]!);
      if (removed) throw Error('Audio preparation cancelled.');
    },
    play() { if (removed) throw Error('No audio.'); requested = true; queue.play(); },
    remove() { if (removed) return; removed = true; requested = false; queue.pause(); queue.destroy(); queue.release(); },
    onStatus(callback) { return queue.onStatus(status => { if (!removed) callback(normalized(status)); }); },
  };
}
