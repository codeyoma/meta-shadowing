// Small, original UI cues. Each device belongs to a cue, not the page that
// triggered it, so a Start cue can finish across client-side navigation.
export function playStageSound(cue: "select" | "start"): void {
  try {
    const context = new AudioContext();
    const voices = new Map<OscillatorNode, GainNode | null>();
    let finished = false;
    let timeout: ReturnType<typeof setTimeout>;
    const release = () => {
      if (finished) return;
      finished = true;
      clearTimeout(timeout);
      for (const [oscillator, gain] of voices) {
        try { oscillator.stop(); } catch { /* Already ended or not started. */ }
        oscillator.disconnect();
        gain?.disconnect();
      }
      voices.clear();
      try { void context.close().catch(() => {}); } catch { /* Device unavailable. */ }
    };
    const play = () => {
      if (finished) return;
      if (context.state !== "running") { release(); return; }
      clearTimeout(timeout);
      // A successful resume earns a full playback window. Normally onended
      // releases the device in <300 ms; this is only a stalled-device fallback.
      timeout = setTimeout(release, 2000);
      try {
        const now = context.currentTime;
        const frequencies = cue === "select" ? [720] : [523.25, 783.99];
        for (const [index, frequency] of frequencies.entries()) {
          const oscillator = context.createOscillator();
          voices.set(oscillator, null);
          const gain = context.createGain();
          voices.set(oscillator, gain);
          const start = now + index * 0.08;
          const duration = cue === "select" ? 0.09 : 0.16;
          oscillator.type = "sine";
          oscillator.frequency.setValueAtTime(frequency, start);
          if (cue === "select") oscillator.frequency.exponentialRampToValueAtTime(420, start + duration);
          gain.gain.setValueAtTime(0, start);
          gain.gain.linearRampToValueAtTime(0.16, start + 0.008);
          gain.gain.exponentialRampToValueAtTime(0.0001, start + duration);
          oscillator.connect(gain).connect(context.destination);
          oscillator.onended = () => {
            if (!voices.delete(oscillator)) return;
            oscillator.disconnect();
            gain.disconnect();
            if (voices.size === 0) release();
          };
          oscillator.start(start);
          oscillator.stop(start + duration + 0.02);
        }
      } catch { release(); }
    };
    // Never leave a suspended device (or stale cue) waiting indefinitely.
    timeout = setTimeout(release, 1000);
    try {
      if (context.state === "running") play();
      else void context.resume().then(play, release);
    } catch { release(); }
  } catch { /* Optional feedback must never prevent selection or navigation. */ }
}
