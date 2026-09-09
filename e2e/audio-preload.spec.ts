import { openLearnerPage } from "./fixtures/cloud-navigation";
import { expect, test } from "./fixtures/cloud-ui";
import { testRecording } from "./fixtures/audio";
import { confirmManualListen } from "./fixtures/manual-practice";

test("only current and next recordings preload, and the buffered next recording plays without a second download", async ({ page }) => {
  await page.addInitScript(() => {
    const live = new Set<string>();
    const create = URL.createObjectURL.bind(URL), revoke = URL.revokeObjectURL.bind(URL);
    URL.createObjectURL = blob => { const url = create(blob); live.add(url); return url; };
    URL.revokeObjectURL = url => { live.delete(url); revoke(url); };
    Object.defineProperty(window, "liveAudioBuffers", { get: () => live.size });
  });
  const requested: number[] = [];
  await page.route("**/api/lessons/*/audio/*", route => {
    const url = new URL(route.request().url());
    expect(url.searchParams.get("version")).toBeTruthy();
    requested.push(Number(url.pathname.split("/").at(-1)));
    return route.fulfill({ contentType: "audio/webm", body: testRecording });
  });
  await page.request.post("/api/auth", { data: { password: "integration-beta-password" } });
  await openLearnerPage(page, "/player?lesson=10000000-0000-4000-8000-000000000001&level=1");
  await page.waitForLoadState("networkidle");
  expect(new Set(requested)).toEqual(new Set([1, 2]));
  // Development Strict Mode may abort its first mount's preload. Once settled,
  // advancing must consume the buffer without any further request for phrase 2.
  const initialNextDownloads = requested.filter(number => number === 2).length;
  await expect(page.locator("audio")).toHaveJSProperty("paused", true);
  await expect(page.getByLabel("완료한 듣기")).toHaveText("필수 0 / 3");
  await page.keyboard.press("Space");
  for (const cycle of [1, 2, 3]) {
    await confirmManualListen(page, "keyboard");
    await expect(page.getByLabel("완료한 듣기")).toHaveText(`필수 ${cycle} / 3`);
  }
  await page.keyboard.press("Space");
  await expect(page.getByText("I wash my face.", { exact: true })).toBeVisible();
  await page.keyboard.press("Space");
  await confirmManualListen(page, "keyboard");
  await expect(page.getByLabel("완료한 듣기")).toHaveText("필수 1 / 3");
  expect(requested.filter(number => number === 2)).toHaveLength(initialNextDownloads);
  await expect.poll(() => new Set(requested)).toEqual(new Set([1, 2, 3]));
  expect(await page.evaluate(async () => (await navigator.serviceWorker.getRegistrations()).length)).toBe(0);
  expect(await page.evaluate(() => caches.keys())).toEqual([]);
  expect(await page.evaluate(() => (window as typeof window & { liveAudioBuffers: number }).liveAudioBuffers)).toBeLessThanOrEqual(2);
  await page.getByRole("button", { name: "학습 메뉴", exact: true }).click();
  await page.getByRole("button", { name: "스테이지 화면으로", exact: true }).click();
  await expect(page).toHaveURL(/\/lessons\/10000000-0000-4000-8000-000000000001\/stages/);
  await expect.poll(() => page.evaluate(() => (window as typeof window & { liveAudioBuffers: number }).liveAudioBuffers)).toBe(0);
});

test("a corrupt prefetched recording stops safely and a fresh retry never counts the failed listen", async ({ page }) => {
  let corrupt = true;
  await page.route("**/api/lessons/*/audio/*", route => {
    const second = new URL(route.request().url()).pathname.endsWith("/2");
    return route.fulfill({ contentType: "audio/webm", body: second && corrupt ? Buffer.from("not audio") : testRecording });
  });
  await page.request.post("/api/auth", { data: { password: "integration-beta-password" } });
  await openLearnerPage(page, "/player?lesson=10000000-0000-4000-8000-000000000001&level=1");
  await page.waitForLoadState("networkidle");
  await page.keyboard.press("Space");
  for (const cycle of [1, 2, 3]) {
    await confirmManualListen(page, "keyboard");
    await expect(page.getByLabel("완료한 듣기")).toHaveText(`필수 ${cycle} / 3`);
  }
  await page.keyboard.press("Space");
  await expect(page.getByRole("button", { name: "CONTINUE · 첫 원음 듣기", exact: true })).toBeEnabled();
  await page.keyboard.press("Space");
  await expect(page.getByRole("button", { name: "RETRY · 다시 시도", exact: true })).toBeVisible();
  await expect(page.getByRole("alert", { name: "원음 재생 오류" })).toHaveCount(0);
  await expect(page.getByLabel("완료한 듣기")).toHaveText("필수 0 / 3");
  await expect(page.locator("audio")).toHaveJSProperty("paused", true);
  corrupt = false;
  await page.getByRole("button", { name: "RETRY · 다시 시도", exact: true }).click();
  await confirmManualListen(page);
  await expect(page.getByLabel("완료한 듣기")).toHaveText("필수 1 / 3");
});
