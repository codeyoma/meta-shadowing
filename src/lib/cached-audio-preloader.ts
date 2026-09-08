import { createMp3Cache, isAudioAccountCurrent, onAudioAccountChange, setAudioCacheAccount } from "./mp3-cache";
import { MP3_CACHE_LIMIT, MP3_RETENTION_MS } from "./mp3-cache-policy";
import { hasSupportedAudioSignature } from "./audio-signature";

type AudioAccess = { accountId: string; lessonId: string; version: string; audioId: string; format: string };
type PreparedAudio = { url: string; key: string; expiresAt: number; persistent: boolean };
type Slot = { controller: AbortController; promise: Promise<PreparedAudio | undefined>; data?: PreparedAudio; format?: string };

async function readableMp3(blob: Blob) {
  if (!hasSupportedAudioSignature("audio.mp3", new Uint8Array(await blob.slice(0, 12).arrayBuffer()))) return false;
  try {
    const decoder = new OfflineAudioContext(1, 1, 44100);
    const decoded = await decoder.decodeAudioData(await blob.arrayBuffer());
    return decoded.length > 0 && decoded.duration > 0;
  } catch { return false; }
}

/** Bounded download: a file larger than our budget goes through native streaming. */
async function boundedBlob(response: Response) {
  if (Number(response.headers.get("content-length")) > MP3_CACHE_LIMIT) { await response.body?.cancel(); return null; }
  const reader = response.body?.getReader();
  if (!reader) throw new Error("unreadable-audio");
  const parts: Uint8Array<ArrayBuffer>[] = [];
  let size = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.length;
    if (size > MP3_CACHE_LIMIT) { await reader.cancel(); return null; }
    parts.push(value);
  }
  const declared = response.headers.get("content-length");
  if (!size || (declared !== null && Number(declared) !== size)) throw new Error("incomplete-audio");
  return new Blob(parts, { type: response.headers.get("content-type")?.split(";")[0] ?? "" });
}

export function createCachedAudioPreloader(audio: HTMLAudioElement, sources: readonly string[], accountId: string) {
  const cache = createMp3Cache(accountId), slots = new Map<number, Slot>();
  let index = -1, disposed = false, request = 0, verification = 0, checking = false;
  let gestureRetry = false, playedFrom: number | null = null, renewed = false;
  const usable = () => !disposed && isAudioAccountCurrent(accountId) && navigator.onLine && !document.hidden;
  const revoke = (data?: PreparedAudio) => { if (data?.url.startsWith("blob:")) URL.revokeObjectURL(data.url); };
  function drop(position: number) {
    const slot = slots.get(position);
    slot?.controller.abort(); revoke(slot?.data); slots.delete(position);
  }
  function pause() { request++; audio.pause(); }
  function deny() {
    pause();
    for (const position of slots.keys()) drop(position);
    audio.removeAttribute("src"); audio.load();
    audio.dispatchEvent(new Event("error"));
  }
  async function authorize(position: number, signal?: AbortSignal): Promise<AudioAccess> {
    if (!usable()) throw new Error("audio-access-unavailable");
    const source = new URL(sources[position], location.href);
    const response = await fetch(`${source.pathname}/access${source.search}`, {
      credentials: "same-origin", cache: "no-store",
      signal: signal ? AbortSignal.any([signal, AbortSignal.timeout(10000)]) : AbortSignal.timeout(10000),
    });
    if (!usable() || signal?.aborted) throw new Error("audio-access-changed");
    if (!response.ok) {
      if (response.status === 401) setAudioCacheAccount(null);
      throw new Error("audio-access-denied");
    }
    const access: AudioAccess = await response.json();
    if (access.accountId !== accountId) { setAudioCacheAccount(access.accountId); throw new Error("audio-account-changed"); }
    if (access.version !== source.searchParams.get("version") || access.lessonId !== source.pathname.split("/")[3]
      || typeof access.audioId !== "string" || !["mp3", "m4a", "webm"].includes(access.format)) throw new Error("audio-version-changed");
    return access;
  }
  const keyFor = (access: AudioAccess) => cache.key(access.lessonId, access.version, access.audioId);
  async function load(position: number, signal: AbortSignal): Promise<PreparedAudio> {
    const access = await authorize(position, signal), key = keyFor(access);
    const slot = slots.get(position);
    if (slot?.controller.signal === signal) slot.format = access.format;
    // Preserve native cold-start streaming for formats outside the MP3 cache.
    // Only the next recording is buffered, as in the original preloader.
    if (access.format !== "mp3" && position === index) {
      return { url: sources[position], key, expiresAt: Date.now() + MP3_RETENTION_MS, persistent: false };
    }
    if (access.format === "mp3") {
      const cached = await cache.read(key);
      if (cached && await readableMp3(cached.bytes)) {
        signal.throwIfAborted();
        if (!usable()) throw new Error("audio-account-changed");
        return { url: URL.createObjectURL(cached.bytes), key, expiresAt: cached.expiresAt, persistent: true };
      }
      if (cached) await cache.remove(key);
    }
    const response = await fetch(sources[position], { credentials: "same-origin", cache: "no-store", signal });
    if (response.status !== 200 || response.headers.has("content-range") || response.type === "opaque") throw new Error("incomplete-audio");
    const blob = await boundedBlob(response);
    if (!blob) return { url: sources[position], key, expiresAt: Date.now() + MP3_RETENTION_MS, persistent: false };
    const mp3 = access.format === "mp3";
    if (mp3 && (!["audio/mpeg", "audio/mp3"].includes(blob.type) || !await readableMp3(blob))) throw new Error("corrupt-mp3");
    signal.throwIfAborted();
    if (!usable()) throw new Error("audio-account-changed");
    const saved = mp3 ? await cache.put(key, blob) : undefined;
    signal.throwIfAborted();
    return { url: URL.createObjectURL(blob), key, expiresAt: saved?.expiresAt ?? Date.now() + MP3_RETENTION_MS, persistent: Boolean(saved) };
  }
  function prepare(position: number) {
    let slot = slots.get(position);
    if (slot) return slot;
    const controller = new AbortController();
    slot = { controller, promise: Promise.resolve(undefined) };
    slots.set(position, slot);
    const pending = slot;
    slot.promise = load(position, controller.signal).then(data => {
      if (disposed || controller.signal.aborted || slots.get(position) !== pending) { revoke(data); return undefined; }
      pending.data = data;
      if (position === index) { audio.preload = "auto"; audio.src = data.url; audio.load(); }
      return data;
    }).catch(() => undefined);
    return slot;
  }
  function select(position: number, refresh = false) {
    if (disposed || !sources[position]) return;
    if (position === index && !refresh && !audio.error) { audio.currentTime = 0; return; }
    const failedSource = refresh || Boolean(audio.error);
    pause(); gestureRetry = false; index = position;
    // The new selection must not expose the old recording's ended/progress state
    // while its asynchronous authorization and preparation are still pending.
    audio.removeAttribute("src"); audio.load();
    if (failedSource) {
      const failed = slots.get(position)?.data;
      if (failed) void cache.remove(failed.key);
      drop(position);
    }
    for (const existing of slots.keys()) if (existing !== position && existing !== position + 1) drop(existing);
    const pending = slots.get(position);
    if (pending?.format && pending.format !== "mp3" && !pending.data) drop(position);
    const current = prepare(position);
    if (current.data) { audio.src = current.data.url; audio.load(); }
    if (sources[position + 1]) prepare(position + 1);
  }
  function nativePlay() {
    gestureRetry = false;
    return audio.play().catch(error => {
      // Safari may require a second tap after async preparation. Keep that tap's
      // play() synchronous, with only a very recent, same-source online grant.
      if (error?.name === "NotAllowedError") gestureRetry = true;
      throw error;
    });
  }
  function play(): Promise<void> {
    const prepared = slots.get(index)?.data;
    if (gestureRetry && prepared && prepared.expiresAt > Date.now() && performance.now() - verification < 3000 && usable()) return nativePlay();
    const token = ++request, position = index;
    return (async () => {
      let slot = prepare(position), data = await slot.promise;
      if (!data || data.expiresAt <= Date.now()) { drop(position); slot = prepare(position); data = await slot.promise; }
      if (!data) throw new Error("audio-unavailable");
      const started = performance.now(), access = await authorize(position, slot.controller.signal);
      if (token !== request || position !== index || !usable() || performance.now() - started >= 10000) throw new DOMException("Playback cancelled", "AbortError");
      if (keyFor(access) !== data.key) { deny(); throw new Error("audio-version-changed"); }
      // Authorization may span the exact expiry boundary. Never play those bytes.
      if (data.expiresAt <= Date.now()) { drop(position); return play(); }
      verification = started;
      await nativePlay();
    })();
  }
  const playing = () => { playedFrom = audio.currentTime; renewed = false; };
  const progress = () => {
    if (playedFrom === null || renewed || audio.paused || audio.seeking || audio.currentTime <= playedFrom || !usable()) return;
    renewed = true;
    const current = slots.get(index)?.data;
    if (current?.persistent) { current.expiresAt = Date.now() + MP3_RETENTION_MS; void cache.played(current.key); }
  };
  const lifecycle = () => { pause(); gestureRetry = false; verification = 0; };
  const unsubscribe = onAudioAccountChange(() => { if (!isAudioAccountCurrent(accountId)) deny(); });
  const timer = setInterval(() => {
    if (audio.paused || disposed) return;
    if (!usable() || performance.now() - verification >= 10000) { deny(); return; }
    if (checking || performance.now() - verification < 8000) return;
    checking = true;
    const token = request, started = performance.now(), position = index;
    void authorize(position).then(access => {
      if (token !== request || position !== index) return;
      if (keyFor(access) !== slots.get(index)?.data?.key || performance.now() - started >= 10000) deny();
      else verification = started;
    }).catch(() => { if (token === request) deny(); }).finally(() => { checking = false; });
  }, 1000);
  audio.addEventListener("playing", playing); audio.addEventListener("timeupdate", progress);
  window.addEventListener("offline", lifecycle); window.addEventListener("focus", lifecycle);
  document.addEventListener("visibilitychange", lifecycle);
  return {
    select, play, pause,
    dispose() {
      disposed = true; pause(); clearInterval(timer); unsubscribe();
      window.removeEventListener("offline", lifecycle); window.removeEventListener("focus", lifecycle);
      document.removeEventListener("visibilitychange", lifecycle);
      audio.removeEventListener("playing", playing); audio.removeEventListener("timeupdate", progress);
      for (const position of slots.keys()) drop(position);
      audio.removeAttribute("src"); audio.load();
    },
  };
}
