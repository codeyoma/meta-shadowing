import type { AudioPort } from './player';

export type NativeStatus = { isLoaded: boolean; playing: boolean; duration: number;
  didJustFinish: boolean; error: string | null; mediaServicesDidReset?: boolean; interrupted?: boolean };
export interface NativeHandle {
  currentTime: number; duration: number; currentStatus: NativeStatus;
  setPlaybackRate(rate: number): void;
  seekTo(seconds: number): Promise<void>;
  play(): void; remove(): void;
  onStatus(callback: (status: NativeStatus) => void): { remove(): void };
}

/** Releasing a paused native handle prevents the SDK's automatic interruption resume. */
export function audioPort(configure: () => Promise<void>, create: (phrase: number) => NativeHandle | Promise<NativeHandle>,
  ended: (duration: number) => void, failed: () => void, interrupted: () => void): AudioPort {
  let player: NativeHandle | undefined;
  let subscription: { remove(): void } | undefined;
  let cancel: (() => void) | undefined;
  let active = false, hasPlayed = false, generation = 0, position = 0;
  function release() {
    generation++;
    active = false;
    if (player) position = player.currentTime;
    cancel?.(); cancel = undefined;
    subscription?.remove(); subscription = undefined;
    player?.remove(); player = undefined;
  }
  return {
    async prepare(phrase, start, rate) {
      release();
      position = start;
      const epoch = generation;
      await configure();
      if (epoch !== generation) throw Error('Audio preparation cancelled.');
      const created = create(phrase);
      // Keep synchronous adapters synchronous; asynchronous composition may outlive navigation.
      const current = created instanceof Promise ? await new Promise<NativeHandle>((resolve, reject) => {
        cancel = () => reject(Error('Audio preparation cancelled.'));
        created.then(handle => {
          if (epoch !== generation) { handle.remove(); return; }
          cancel = undefined;
          resolve(handle);
        }, error => {
          if (epoch === generation) cancel = undefined;
          reject(error);
        });
      }) : created;
      if (epoch !== generation) { current.remove(); throw Error('Audio preparation cancelled.'); }
      player = current; hasPlayed = false;
      await new Promise<void>((resolve, reject) => {
        let ready = false, settled = false;
        const timeout = setTimeout(() => finish(Error('Audio loading timed out.')), 10000);
        function finish(error?: Error) {
          if (settled) return;
          settled = true; clearTimeout(timeout);
          if (player === current) cancel = undefined;
          error ? reject(error) : resolve();
        }
        cancel = () => finish(Error('Audio preparation cancelled.'));
        async function status(s: NativeStatus) {
          if (player !== current) return;
          if (s.error || s.mediaServicesDidReset) {
            if (!settled) finish(Error('Audio unavailable.'));
            else if (active) { active = false; failed(); }
            return;
          }
          if (!ready && s.isLoaded) {
            ready = true;
            try {
              current.setPlaybackRate(rate);
              await current.seekTo(Math.min(start, current.duration));
              if (player !== current || epoch !== generation) return;
              finish();
            } catch { finish(Error('Audio could not resume.')); }
            return;
          }
          if (!active) return;
          if (s.didJustFinish) { active = false; ended(s.duration); }
          else if (s.playing) hasPlayed = true;
          else if (hasPlayed || s.interrupted) { active = false; interrupted(); }
        }
        subscription = current.onStatus(s => { void status(s); });
        void status(current.currentStatus);
      });
    },
    play() { if (!player) throw Error('No audio.'); active = true; player.play(); },
    pause: release,
    position: () => player?.currentTime ?? position,
    duration: () => player?.duration ?? 0,
    dispose: release,
  };
}
