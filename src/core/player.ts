import { transition, type Session } from './session';

export interface AudioPort {
  prepare(phrase: number, position: number, rate: number): Promise<void>;
  play(): void; pause(): void; position(): number; dispose(): void;
  duration?(): number;
}

/** Coordinates only local boundaries. No server acknowledgement is involved. */
export class Player {
  error: 'save' | 'audio' | null = null;
  private generation = 0;
  private lastSave = 0;
  private preparing = false;
  private disposed = false;
  constructor(public state: Session, private audio: AudioPort,
    private save: (s: Session) => void, private now: () => number, private changed: () => void) {}

  private persist(): boolean {
    try { this.save(this.state); this.lastSave = this.now(); return true; }
    catch { this.stopWithError('save'); return false; }
  }
  private stopWithError(error: 'save' | 'audio') {
    this.generation++;
    this.preparing = false;
    this.audio.pause();
    this.state = transition(this.state, { type: 'pause' });
    this.error = error;
    this.changed();
  }
  /** Stage entry replays only an already-finished, unconfirmed audio pass. */
  async enter() {
    if (this.disposed || this.preparing || this.state.running || this.error) return;
    if (this.state.phase === 'speaking') {
      this.state = { ...this.state, phase: 'ready', audioSeconds: 0, remainingMs: 0 };
      this.changed();
    }
    await this.resume(1000);
  }
  async resume(delayMs = 0) {
    if (this.disposed || this.preparing || this.state.running
      || ['decision', 'complete'].includes(this.state.phase)) return;
    this.error = null;
    if (!this.persist()) return;
    const generation = ++this.generation;
    const next = transition(this.state, { type: 'resume' });
    this.preparing = true;
    try {
      if (delayMs > 0) await new Promise<void>(resolve => setTimeout(resolve, delayMs));
      if (generation !== this.generation || this.disposed) return;
      if (next.phase === 'listening') await this.audio.prepare(next.phrase, next.audioSeconds, next.rate);
      if (generation !== this.generation || this.disposed) return;
      this.state = next;
      if (!this.persist()) return;
      if (next.phase === 'listening') this.audio.play();
      this.changed();
    } catch { if (generation === this.generation) this.audioFailed(); }
    finally { if (generation === this.generation) this.preparing = false; }
  }
  pause() {
    if (this.disposed) return;
    this.generation++;
    this.preparing = false;
    this.audio.pause();
    this.capture();
    this.state = transition(this.state, { type: 'pause' });
    this.persist();
    this.changed();
  }
  private capture() {
    if (this.state.running && this.state.phase === 'listening') {
      this.state = transition(this.state, { type: 'audio-position', seconds: this.audio.position() });
    }
  }
  tick() {
    if (!this.state.running || this.disposed) return;
    const phase = this.state.phase;
    this.capture();
    if (phase !== this.state.phase || this.now() - this.lastSave >= 500) {
      if (!this.persist()) return;
    }
    this.changed();
  }
  audioEnded(durationSeconds: number) {
    if (!this.state.running || this.state.phase !== 'listening' || this.preparing) return;
    this.audio.pause();
    this.state = transition(this.state, { type: 'audio-ended', durationSeconds });
    this.persist();
    this.changed();
  }
  audioFailed() {
    this.capture();
    this.stopWithError('audio');
    this.persist();
  }
  async confirm() {
    if (this.error || this.preparing || this.disposed) return;
    this.state = transition(this.state, { type: 'confirm' });
    if (!this.persist()) return;
    this.changed();
    if (this.state.phase === 'ready') await this.resume();
  }
  async choose(type: 'repeat' | 'next') {
    if (this.error || this.disposed) return;
    this.state = transition(this.state, { type });
    if (!this.persist()) return;
    this.changed();
    if (this.state.phase === 'ready') await this.resume(type === 'next' ? 1000 : 0);
  }
  retrySave() { this.error = null; this.persist(); this.changed(); }
  dispose() { this.pause(); this.disposed = true; this.audio.dispose(); }
}
