import type { Player } from './player';

export interface DictionaryPort {
  /** Settles only when the native sheet is gone. */
  present(id: string, term: string): Promise<void>;
  dismiss(id: string): Promise<void>;
}
export type DictionaryContext = { scope: string; player: Player | null; allowed: boolean; words: ReadonlySet<string> };
let requestSequence = 0;

/** A temporary learning surface, never a player action or a source of rewards. */
export class LearningDictionary {
  private request: string | null = null;
  private cancelled = false;
  get blocked() { return this.request !== null; }
  constructor(private native: DictionaryPort, private context: () => DictionaryContext, private changed: () => void) {}

  async cancel() {
    this.cancelled = true;
    const id = this.request;
    if (id !== null) await this.native.dismiss(id);
  }

  async lookup(scope: string, term: string): Promise<void> {
    const current = this.context();
    if (this.blocked || !current.allowed || current.scope !== scope || !current.words.has(term) || !current.player) return;
    const player = current.player;
    const id = String(++requestSequence);
    this.request = id; this.cancelled = false; this.changed();
    try {
      player.pause();
      const latest = this.context();
      if (this.cancelled || player.error === 'save' || !latest.allowed || latest.scope !== scope || latest.player !== player
        || !latest.words.has(term)) return;
      await this.native.present(id, term);
    } finally {
      if (this.request === id) { this.request = null; this.changed(); }
    }
  }
}
