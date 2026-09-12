type Feedback = { active(): boolean; haptic(): void | Promise<void>; sound(): void | Promise<void> };

export function allowsTapFeedback(pathname: string, enabled = true) {
  return enabled && pathname !== '/player-options' && pathname !== '/languages'
    && pathname !== '/settings' && !pathname.startsWith('/settings/');
}

export function createTapFeedback(feedback: Feedback, now = Date.now) {
  let lastTap = -Infinity;
  return (enabled = true, sound = true) => {
    if (!enabled || !feedback.active()) return;
    const time = now();
    if (time - lastTap < 90) return;
    lastTap = time;
    // Cosmetic feedback must never delay or reject the actual navigation/learning action.
    for (const effect of sound ? [feedback.haptic, feedback.sound] : [feedback.haptic]) {
      try { void Promise.resolve(effect()).catch(() => {}); } catch { /* Optional hardware. */ }
    }
  };
}

type TapSound = { loaded(): boolean; seek(): Promise<void>; play(): void; release(): void };

export function createTapSound(create: () => TapSound) {
  let player: TapSound | undefined;
  let generation = 0;
  let seeking = false;
  return {
    activate() {
      if (player) return;
      try { player = create(); } catch { /* Cosmetic feedback is optional. */ }
    },
    deactivate() {
      generation++;
      seeking = false;
      const previous = player;
      player = undefined;
      try { previous?.release(); } catch { /* Best-effort cleanup. */ }
    },
    async play() {
      const current = player;
      if (!current?.loaded() || seeking) return;
      const token = generation;
      seeking = true;
      try {
        await current.seek();
        if (generation === token) current.play();
      } finally { if (generation === token) seeking = false; }
    },
  };
}
