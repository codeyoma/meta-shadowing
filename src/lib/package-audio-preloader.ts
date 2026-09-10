/** Receives only already validated local bytes. No network or cache fallback. */
export function createPackageAudioPreloader(audio: HTMLAudioElement, blobs: readonly Blob[]) {
  let url: string | undefined;
  let disposed = false;
  return {
    select(index: number, _refresh = false) {
      if (disposed) return;
      if (url) URL.revokeObjectURL(url);
      url = undefined;
      const blob = blobs[index];
      if (!blob) { audio.removeAttribute("src"); audio.load(); throw new Error("Complete local audio required"); }
      url = URL.createObjectURL(blob);
      audio.preload = "auto"; audio.src = url; audio.load();
    },
    play: () => audio.play(),
    pause: () => audio.pause(),
    dispose() { disposed = true; audio.pause(); audio.removeAttribute("src"); audio.load(); if (url) URL.revokeObjectURL(url); url = undefined; },
  };
}
