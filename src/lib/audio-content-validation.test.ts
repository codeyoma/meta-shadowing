import { afterEach, expect, test, vi } from "vitest";
import { validateAudioContent } from "./audio-content-validation";
import type { AudioPackageItem } from "./audio-package";
import { createClient } from "@supabase/supabase-js";

const items = (count: number): AudioPackageItem[] => Array.from({ length: count }, (_, index) => ({
  phraseNumber: index + 1, sourceLine: index + 1,
  originalName: `${String(index + 1).padStart(3, "0")}.mp3`,
  canonicalName: `${String(index + 1).padStart(3, "0")}.mp3`,
  contentType: "audio/mpeg", size: 100
}));
afterEach(() => vi.useRealTimers());

test("a 560-file package finishes inside the budget with bounded parallel reads", async () => {
  vi.useFakeTimers();
  let active = 0, peak = 0, finished = 0;
  const result = validateAudioContent(items(560), async () => {
    active++; peak = Math.max(peak, active);
    await new Promise(resolve => setTimeout(resolve, 1000));
    active--; finished++;
    return new Uint8Array([0x49, 0x44, 0x33]);
  });
  await vi.advanceTimersByTimeAsync(75000);
  expect(finished).toBe(560);
  expect(peak).toBeGreaterThan(1);
  expect(peak).toBeLessThanOrEqual(8);
  await expect(result).resolves.toEqual([]);
});

test("corrupt signatures are returned in phrase order despite out-of-order reads", async () => {
  const result = await validateAudioContent(items(3), async item => {
    if (item.phraseNumber === 1) await new Promise(resolve => setTimeout(resolve, 10));
    return item.phraseNumber === 2 ? new Uint8Array([0x49, 0x44, 0x33]) : new Uint8Array([1, 2]);
  });
  expect(result.map(issue => [issue.code, issue.phraseNumber])).toEqual([
    ["invalid-audio-content", 1], ["invalid-audio-content", 3]
  ]);
});

test("stalled reads are cancelled and cannot produce a valid package", async () => {
  vi.useFakeTimers();
  const signals: AbortSignal[] = [];
  const result = validateAudioContent(items(2), (_item, signal) => {
    signals.push(signal);
    return new Promise((_, reject) => signal.addEventListener("abort", () => reject(signal.reason), { once: true }));
  });
  const rejected = expect(result).rejects.toThrow();
  await vi.advanceTimersByTimeAsync(120001);
  await rejected;
  expect(signals.every(signal => signal.aborted)).toBe(true);
});

test("a failed read cancels other requests instead of accepting a partial package", async () => {
  const signals: AbortSignal[] = [];
  const result = validateAudioContent(items(20), async (item, signal) => {
    signals.push(signal);
    if (item.phraseNumber === 1) throw new Error("read failed");
    return new Promise((_, reject) => signal.addEventListener("abort", () => reject(signal.reason), { once: true }));
  });
  await expect(result).rejects.toMatchObject({ code: "audio-read-failed" });
  expect(signals.length).toBeLessThanOrEqual(8);
  expect(signals.every(signal => signal.aborted)).toBe(true);
});

test("cancellation after Storage response headers is classified as a retryable timeout", async () => {
  vi.useFakeTimers();
  let responseStarted = false;
  const storage = createClient("http://storage.example.test", "test-publishable-key", {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { fetch: async (_url, init) => {
      responseStarted = true;
      return new Response(new ReadableStream({ start(controller) {
        init!.signal!.addEventListener("abort", () => controller.error(new DOMException("Read aborted", "AbortError")), { once: true });
      } }), { status: 206, headers: { "Content-Type": "audio/mpeg" } });
    } }
  }).storage.from("lesson-audio");
  const result = validateAudioContent(items(1), async (_item, signal) => {
    const response = await storage.download("001.mp3", {}, { signal });
    if (response.error) throw response.error;
    return new Uint8Array(await response.data!.arrayBuffer());
  });
  const outcome = result.then(value => ({ value }), error => ({ error }));
  await vi.advanceTimersByTimeAsync(1);
  expect(responseStarted).toBe(true);
  await vi.advanceTimersByTimeAsync(120000);
  await expect(outcome).resolves.toMatchObject({ error: { code: "audio-validation-timeout" } });
});
