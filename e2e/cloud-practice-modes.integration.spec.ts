import { expect, test, lessonIds } from "./fixtures/cloud-ui";
import { openLearnerPage, readDeviceJournal, readServerJournal, advanceCloudClock } from "./fixtures/cloud-navigation";
import { confirmManualListen } from "./fixtures/manual-practice";
import { auditLearningStorage } from "./fixtures/storage-audit";

test.skip(process.env.ADMIN_SUPABASE_INTEGRATION !== "1", "requires disposable local Supabase");

for (const level of [1,2,3,4,5,6,7,8]) test(`device level ${level} persists settings and completion without automatic cross-device resume`, async ({ page, browser, baseURL, viewport, isMobile, hasTouch, deviceScaleFactor, userAgent }) => {
  test.setTimeout(60000);
  await page.request.post("/api/auth", { data: { password: "integration-beta-password" } });
  const profile = (await (await page.request.get("/api/learner/preferences")).json()).profile;
  const accesses = await auditLearningStorage(page.context());
  const errors: string[] = [];
  page.on("pageerror", error => errors.push(error.message));
  const grouped = level === 4 || level === 5, rapid = level >= 6;
  if (rapid) await page.clock.install({ time: new Date("2026-09-10T00:00:00Z") });
  const href = `/player?lesson=${lessonIds[0]}&level=${level}&stage=${level * 2 - 1}&mode=manual&group=2&groupGap=0&speed=2&wpm=6&lineGap=0&speak=0`;
  await openLearnerPage(page, href);
  const id = new URL(page.url()).searchParams.get("run");
  const dependencies: string[] = [];
  page.on("request", request => {
    if (/\/api\/learner\/(practice|preferences)|\/api\/lessons\/.*\/audio\//.test(request.url())) dependencies.push(new URL(request.url()).pathname);
  });
  await page.getByRole("button", { name: "학습 메뉴", exact: true }).click();
  await page.getByRole("button", { name: "학습 설정", exact: true }).click();
  const setting = page.getByLabel(rapid ? "단어 속도" : "재생속도", { exact: true });
  await setting.selectOption(rapid ? "5" : "3");
  await expect(setting).toHaveValue(rapid ? "5" : "3");
  await expect.poll(async () => (await readDeviceJournal(page))!.runs[0].settings[rapid ? "wpmLevel" : "speed"]).toBe(rapid ? 5 : 3);
  expect((await readDeviceJournal(page))!.settings).toMatchObject({ speed: 2, wpmLevel: 6 });
  await page.keyboard.press("Escape");
  await page.getByRole("button", { name: "학습 메뉴", exact: true }).click();
  await page.getByRole("button", { name: "문장 목록", exact: true }).click();
  await page.getByRole("button", { name: /^3번 문장/ }).click();
  expect((await readDeviceJournal(page))!.studyDays).toEqual([]);
  await page.getByRole("button", { name: /^CONTINUE/ }).click();
  if (rapid) await advanceCloudClock(page, 5000);
  else {
    for (let cycle = 0; cycle < 3; cycle++) await confirmManualListen(page);
    await page.getByRole("button", { name: /^NEXT/ }).click();
  }
  await expect(page.getByRole("heading", { name: `레벨 ${level} 학습 완료`, exact: true })).toBeVisible();
  await page.reload();
  await expect(page.getByRole("heading", { name: `레벨 ${level} 학습 완료`, exact: true })).toBeVisible();
  const completed = (await readDeviceJournal(page))!;
  expect(completed.history).toHaveLength(1);
  expect(completed.history[0]).toMatchObject({ runId: id, nextPhrase: 3, nextUnit: grouped ? 1 : 3, settings: rapid ? { wpmLevel: 5 } : { speed: 3 } });
  expect(completed.studyDays).toHaveLength(1);
  expect(dependencies).toEqual([]);
  expect((await (await page.request.get("/api/learner/preferences")).json()).profile.overrides).toEqual(profile.overrides);
  expect(await readServerJournal(page)).toMatchObject({ progress: null, history: [] });
  const other = await browser.newContext({ baseURL, ignoreHTTPSErrors: true, viewport, isMobile, hasTouch, deviceScaleFactor, userAgent,
    storageState: { cookies: await page.context().cookies(), origins: [] } });
  try {
    const secondAccesses = await auditLearningStorage(other);
    const second = await other.newPage();
    second.on("pageerror", error => errors.push(error.message));
    await openLearnerPage(second, `/player?lesson=${lessonIds[0]}&level=${level}&stage=${level * 2 - 1}`);
    await expect(second.getByRole("progressbar").first()).toHaveAttribute("aria-valuenow", "0");
    const independent = (await readDeviceJournal(second))!;
    expect(independent.history).toEqual([]);
    expect(independent.runs[0].runId).not.toBe(id);
    expect(independent.runs[0].settings).toMatchObject({ speed: 1, wpmLevel: 3 });
    expect((await readDeviceJournal(page))!.history[0].runId).toBe(id);
    expect(accesses).toEqual([]);
    expect(secondAccesses).toEqual([]);
    expect(errors).toEqual([]);
  } finally { await other.close(); }
});
