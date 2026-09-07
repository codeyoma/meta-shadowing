// Original ascending three-note cue. Optional feedback must never block practice.
export function createSuccessChime() {
  let context: AudioContext | null = null;
  let resuming: AudioContext | null = null;
  let pending = false;
  const voices = new Set<OscillatorNode>();
  function flush() {
    if (!pending || !context || context.state !== "running") return;
    pending = false;
    try {
      const now = context.currentTime;
      for (const [index, frequency] of [523.25, 659.25, 783.99].entries()) {
        const oscillator = context.createOscillator();
        const gain = context.createGain();
        const start = now + index * 0.1;
        const duration = index === 2 ? 0.32 : 0.2;
        oscillator.type = "sine";
        oscillator.frequency.value = frequency;
        gain.gain.setValueAtTime(0, start);
        gain.gain.linearRampToValueAtTime(0.065, start + 0.012);
        gain.gain.exponentialRampToValueAtTime(0.0001, start + duration);
        oscillator.connect(gain).connect(context.destination);
        voices.add(oscillator);
        oscillator.onended = () => { voices.delete(oscillator); oscillator.disconnect(); gain.disconnect(); };
        oscillator.start(start);
        oscillator.stop(start + duration + 0.02);
      }
    } catch { /* Keep learning usable even if the audio device fails. */ }
  }
  function resume() {
    const device = context;
    if (!device || device.state === "running" || device.state === "closed" || resuming === device) return;
    resuming = device;
    void device.resume().then(() => {
      if (resuming === device) resuming = null;
      if (context === device) flush();
    }, () => {
      if (resuming === device) resuming = null;
      if (context === device) pending = false;
    });
  }
  return {
    unlock() {
      try { context ??= new AudioContext(); resume(); }
      catch { /* Web Audio may be unavailable or blocked. */ }
    },
    play() {
      if (!context) return;
      pending = true;
      try { flush(); resume(); } catch { pending = false; }
    },
    cancelPending() { pending = false; },
    dispose() {
      pending = false;
      resuming = null;
      for (const voice of voices) { try { voice.stop(); } catch { /* Already ended. */ } }
      voices.clear();
      if (context) void context.close().catch(() => {});
      context = null;
    }
  };
}
