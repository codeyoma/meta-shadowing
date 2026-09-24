import type { AudioPort } from './player';
export type VideoStatus = { owner: string; generation: number; phase: 'ready' | 'playing' | 'paused' | 'ended' | 'failed'; position: number; duration: number };
export interface VideoBridge {
  prepare(owner: string, generation: number, phrase: number, position: number, rate: number): Promise<void>;
  play(owner: string, generation: number): void; pause(owner: string): void; dispose(owner: string): void;
  subscribe(listener: (event: VideoStatus) => void): { remove(): void };
}
let nextGeneration = 0;
export function videoPlayback(owner: string, bridge: VideoBridge, ended: (d: number) => void,
  failed: () => void, interrupted: () => void): AudioPort {
  let generation = 0, position = 0, duration = 0, active = false, disposed = false;
  let interruptible = false;
  let cancel: (() => void) | undefined;
  const subscription = bridge.subscribe(s => {
    if (disposed || s.owner !== owner || s.generation !== generation) return;
    if (Number.isFinite(s.position) && s.position >= 0) position = s.position;
    if (Number.isFinite(s.duration) && s.duration > 0) duration = s.duration;
    // A native interruption can arrive while the initial seek is still pending,
    // or between its resolution and play(). Retire that request before notifying Player.
    if (s.phase === 'paused' && interruptible) { pause(); interrupted(); return; }
    if (!active) return;
    if (s.phase === 'ended') { active = false; ended(duration); }
    else if (s.phase === 'failed') { active = false; failed(); }
  });
  function pause() {
    active = false; interruptible = false; generation = ++nextGeneration; cancel?.(); cancel = undefined;
    if (!disposed) bridge.pause(owner);
  }
  return {
    async prepare(phrase, start, rate) {
      if (disposed) throw Error('Video disposed.');
      pause(); position = start; duration = 0; interruptible = true;
      const current = generation;
      await new Promise<void>((resolve, reject) => {
        const timeout = setTimeout(() => { pause(); reject(Error('Video preparation timed out.')); }, 15000);
        function finish(error?: unknown) {
          clearTimeout(timeout);
          if (current === generation) cancel = undefined;
          error ? reject(Error('Video preparation failed.')) : resolve();
        }
        cancel = () => finish(Error('Cancelled.'));
        bridge.prepare(owner, current, phrase, start, rate).then(() => {
          if (!disposed && current === generation) finish();
        }, finish);
      });
    },
    play() { if (disposed) throw Error('Video disposed.'); active = true; bridge.play(owner, generation); },
    pause, position: () => position, duration: () => duration,
    dispose() { if (disposed) return; pause(); disposed = true; subscription.remove(); bridge.dispose(owner); },
  };
}
