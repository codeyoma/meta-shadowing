import { createCachedAudioPreloader } from "./cached-audio-preloader";

/** Isolated component fixtures omit the account; routed learners always provide it. */
export function createAudioPreloader(audio: HTMLAudioElement, sources: readonly string[], accountId?: string) {
  if (accountId) return createCachedAudioPreloader(audio, sources, accountId);
  let currentIndex = -1;
  let currentBlob: string | undefined;
  let next: { index: number; controller: AbortController; url?: string } | undefined;
  let disposed = false;
  let revision = 0;

  function clearNext() {
    next?.controller.abort();
    if (next?.url) URL.revokeObjectURL(next.url);
    next = undefined;
  }

  function preloadNext(index: number) {
    if (!sources[index]) return;
    const pending = { index, controller: new AbortController(), url: undefined as string | undefined };
    next = pending;
    void fetch(sources[index], { signal: pending.controller.signal, credentials: "same-origin", cache: "no-store" })
      .then(response => {
        if (!response.ok) throw new Error("Audio unavailable");
        return response.blob();
      })
      .then(blob => {
        if (!disposed && next === pending && !pending.controller.signal.aborted) pending.url = URL.createObjectURL(blob);
      })
      // A speculative failure must not interrupt the current listen. Selecting this
      // phrase falls back to a fresh native request, with the normal retry UI.
      .catch(() => {});
  }

  return {
    play: () => audio.play(),
    pause: () => audio.pause(),
    select(index: number, refresh = false) {
      if (disposed || !sources[index]) return;
      if (index === currentIndex && !refresh && !audio.error) {
        audio.currentTime = 0;
        return;
      }
      const buffered = !refresh && next?.index === index ? next.url : undefined;
      if (buffered && next) next.url = undefined; // transfer ownership to current
      clearNext();
      if (currentBlob) URL.revokeObjectURL(currentBlob);
      currentBlob = buffered;
      currentIndex = index;
      audio.preload = "auto";
      audio.src = buffered ?? `${sources[index]}&load=${++revision}`;
      audio.load();
      preloadNext(index + 1);
    },
    dispose() {
      disposed = true;
      clearNext();
      if (currentBlob) URL.revokeObjectURL(currentBlob);
      currentBlob = undefined;
      audio.pause();
      audio.removeAttribute("src");
      audio.load();
    }
  };
}
