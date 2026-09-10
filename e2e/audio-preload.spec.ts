import { openLearnerPage } from "./fixtures/cloud-navigation";
import { expect, test } from "./fixtures/cloud-ui";
import { testRecording } from "./fixtures/audio";
import { confirmManualListen } from "./fixtures/manual-practice";

test("the full package downloads before entry and advancing plays local recordings without new downloads", async ({ page }) => {
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
  expect(new Set(requested)).toEqual(new Set([1, 2, 3]));
  // The complete lesson has been verified before entry. Advancing consumes only local blobs.
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
  // Ticket29 permits only the anonymous shell/static cache; audio remains in the
  // verified package store and may never enter the service-worker cache.
  const cachedPaths = await page.evaluate(async () => (await Promise.all((await caches.keys()).map(async name =>
    (await (await caches.open(name)).keys()).map(request => new URL(request.url).pathname)))).flat());
  expect(cachedPaths.every(path => path === "/offline" || path === "/offline-assets" || path.startsWith("/_next/static/"))).toBe(true);
  expect(await page.evaluate(() => (window as typeof window & { liveAudioBuffers: number }).liveAudioBuffers)).toBeLessThanOrEqual(2);
  await page.getByRole("button", { name: "학습 메뉴", exact: true }).click();
  await page.getByRole("button", { name: "스테이지 화면으로", exact: true }).click();
  await expect(page).toHaveURL(/\/lessons\/10000000-0000-4000-8000-000000000001\/stages/);
  await expect.poll(() => page.evaluate(() => (window as typeof window & { liveAudioBuffers: number }).liveAudioBuffers)).toBe(0);
});

test("corrupt package audio blocks entry and a verified retry starts with no completed listens", async ({ page }) => {
  let corrupt = true;
  await page.route("**/api/lessons/*/audio/*", route => {
    const second = new URL(route.request().url()).pathname.endsWith("/2");
    return route.fulfill({ contentType: "audio/webm", body: second && corrupt ? Buffer.from("not audio") : testRecording });
  });
  await page.request.post("/api/auth", { data: { password: "integration-beta-password" } });
  await page.goto("/player?lesson=10000000-0000-4000-8000-000000000001&level=1");
  const row = page.getByRole("group", { name: / 다운로드$/ });
  await row.getByRole("button", { name: / 다운로드$/ }).click();
  await expect(row.getByRole("button", { name: / 이어받기$| 다시 받기$/ })).toBeVisible();
  await expect(page.locator("audio")).toHaveCount(0);
  corrupt = false;
  await row.getByRole("button", { name: / 이어받기$| 다시 받기$/ }).click();
  await expect(page.getByRole("button", { name: "CONTINUE · 첫 원음 듣기", exact: true })).toBeEnabled();
  await expect(page.getByLabel("완료한 듣기")).toHaveText("필수 0 / 3");
  await page.keyboard.press("Space");
  await confirmManualListen(page);
  await expect(page.getByLabel("완료한 듣기")).toHaveText("필수 1 / 3");
});
