import { expect, test } from "./fixtures/cloud-ui";
import { openLearnerPage, readDeviceJournal } from "./fixtures/cloud-navigation";
import { confirmManualListen } from "./fixtures/manual-practice";
import { advanceCloudClock } from "./fixtures/cloud-navigation";
import { loadPackageModules } from "./fixtures/package-store";
import { createClient } from "@supabase/supabase-js";
import { randomUUID } from "node:crypto";
import { assertLocalSupabaseUrl } from "./fixtures/local-supabase-google";

const levelTwo = "/player?lesson=10000000-0000-4000-8000-000000000001&level=2&stage=3";

test("installed level 2 advances and reloads from the device without learner or audio HTTP", async ({ page }) => {
  await page.request.post("/api/auth", { data: { password: "integration-beta-password" } });
  await openLearnerPage(page, levelTwo);
  const dependencies: string[] = [];
  page.on("request", request => {
    if (/\/api\/learner\/(practice|preferences)|\/api\/lessons\/.*\/audio\//.test(request.url())) dependencies.push(new URL(request.url()).pathname);
  });
  await page.route("**/api/learner/practice**", route => route.abort());
  await page.route("**/api/learner/preferences**", route => route.abort());
  await page.route("**/api/lessons/*/audio/**", route => route.abort());

  await page.getByRole("button", { name: "CONTINUE · 첫 원음 듣기", exact: true }).click();
  for (let cycle = 0; cycle < 3; cycle++) await confirmManualListen(page);
  await page.getByRole("button", { name: "NEXT · 다음 프레이즈", exact: true }).click();
  await expect(page.getByText("I wash my face.", { exact: true })).toBeVisible();
  await page.reload();
  await expect(page.getByText("I wash my face.", { exact: true })).toBeVisible();
  expect(dependencies).toEqual([]);
});

test("every installed level opens through account-scoped device runs without lease or remote media reads", async ({ page }) => {
  await page.request.post("/api/auth", { data: { password: "integration-beta-password" } });
  await openLearnerPage(page, "/player?lesson=10000000-0000-4000-8000-000000000001&level=1&stage=1");
  const dependencies: string[] = [];
  page.on("request", request => {
    if (/\/api\/learner\/practice|\/api\/lessons\/.*\/audio\//.test(request.url())) dependencies.push(new URL(request.url()).pathname);
  });
  await page.route("**/api/learner/practice**", route => route.abort());
  await page.route("**/api/lessons/*/audio/**", route => route.abort());

  for (let level = 1; level <= 8; level++) {
    const stage = level * 2 - 1;
    await page.goto(`/player?lesson=10000000-0000-4000-8000-000000000001&level=${level}&stage=${stage}`);
    await expect(page.getByRole("button", { name: `메타쉐도잉 레벨 ${level}`, exact: true })).toBeVisible();
  }
  const journal = await readDeviceJournal(page);
  expect(journal?.runs.map(run => [run.level, run.stage])).toEqual([
    [1, 1], [2, 3], [3, 5], [4, 7], [5, 9], [6, 11], [7, 13], [8, 15],
  ]);
  expect(dependencies).toEqual([]);
});

test("dictionary and sentence analysis popups use the pinned package while their APIs are blocked", async ({ page }) => {
  await page.request.post("/api/auth", { data: { password: "integration-beta-password" } });
  const url = process.env.SUPABASE_INTEGRATION_URL!; assertLocalSupabaseUrl(url);
  const service = createClient(url, process.env.SUPABASE_INTEGRATION_SECRET_KEY!, { auth: { persistSession: false, autoRefreshToken: false } });
  const dictionaryId = `device-package-${randomUUID()}`;
  const syntaxId = randomUUID();
  try {
  expect((await service.from("dictionary_entries").insert({ id: dictionaryId, language: "en", headword: "wake", lookup_keys: ["wake"], source_dump: "disposable-device-package-fixture",
    entry: { headword: "wake", language: "en", pos: "verb", senses: [{ glosses: ["잠에서 깨다: 설치된 패키지 정의"] }],
      sourceUrl: "https://ko.wiktionary.org/wiki/wake", license: "CC BY-SA 4.0" } })).error).toBeNull();
  expect((await service.from("lesson_sentence_syntax").insert({ id: syntaxId, draft_id: "10000000-0000-4000-8000-000000000001", phrase_number: 1,
    sentence_number: 1, begin_offset: 0, text_content: "I wake up at seven.", language_code: "en", text_hash: "disposable-device-package-fixture", status: "complete",
    response: { tokens: [
      { text: { content: "I", beginOffset: 0 }, lemma: "I", partOfSpeech: { tag: "PRON" }, dependencyEdge: { headTokenIndex: 1, label: "NSUBJ" } },
      { text: { content: "wake", beginOffset: 2 }, lemma: "wake", partOfSpeech: { tag: "VERB", tense: "PRESENT" }, dependencyEdge: { headTokenIndex: 1, label: "ROOT" } },
    ] } })).error).toBeNull();
  await openLearnerPage(page, "/player?lesson=10000000-0000-4000-8000-000000000001&level=1&stage=1");
  // Remove source rows after acquisition: exact content must come from the
  // installed manifest even when the original source is no longer available.
  expect((await service.from("dictionary_entries").delete().eq("id", dictionaryId)).error).toBeNull();
  expect((await service.from("lesson_sentence_syntax").delete().eq("id", syntaxId)).error).toBeNull();
  await page.reload();
  const remoteReads: string[] = [];
  page.on("request", request => {
    if (/\/api\/dictionary|\/syntax\//.test(request.url())) remoteReads.push(new URL(request.url()).pathname);
  });
  await page.route("**/api/dictionary**", route => route.abort());
  await page.route("**/api/lessons/*/syntax/**", route => route.abort());

  await page.getByRole("button", { name: "wake 뜻 보기", exact: true }).click();
  const dictionary = page.getByRole("dialog", { name: "wake 뜻", exact: true });
  await expect(dictionary.locator('[aria-busy="false"]')).toBeVisible();
  await expect(dictionary).toContainText("잠에서 깨다: 설치된 패키지 정의");
  await page.keyboard.press("Escape");
  await page.getByRole("button", { name: "문장 분석", exact: true }).click();
  const analysis = page.getByRole("dialog", { name: "문장 분석", exact: true });
  await expect(analysis.locator('[aria-busy="false"]')).toBeVisible();
  await expect(analysis.getByRole("article", { name: "문장 1", exact: true })).toContainText("I wake up at seven.");
  await analysis.getByRole("button", { name: "I 분석 보기", exact: true }).click();
  await expect(analysis).toContainText("‘wake’에 ‘주어’ 관계로 연결돼요.");
  expect(remoteReads).toEqual([]);
  } finally {
    await service.from("dictionary_entries").delete().eq("id", dictionaryId);
    await service.from("lesson_sentence_syntax").delete().eq("id", syntaxId);
  }
});

test("each audio level durably crosses its phrase or grouped boundary offline and reloads there", async ({ page, context }) => {
  await page.request.post("/api/auth", { data: { password: "integration-beta-password" } });
  await openLearnerPage(page, "/player?lesson=10000000-0000-4000-8000-000000000002&level=1&stage=1");
  const remote: string[] = [];
  page.on("request", request => { if (/\/api\/learner\/(practice|preferences)|\/api\/lessons\/.*\/audio\//.test(request.url())) remote.push(new URL(request.url()).pathname); });
  for (let level = 1; level <= 5; level++) {
    await page.goto(`/player?lesson=10000000-0000-4000-8000-000000000002&level=${level}&stage=${level * 2 - 1}`);
    await context.setOffline(true);
    await page.getByRole("button", { name: "CONTINUE · 첫 원음 듣기", exact: true }).click();
    for (let cycle = 0; cycle < 3; cycle++) await confirmManualListen(page);
    await page.getByRole("button", { name: level >= 4 ? "NEXT · 다음 묶음" : "NEXT · 다음 프레이즈", exact: true }).click();
    await context.setOffline(false);
    await page.reload();
    await expect(page.getByRole("progressbar", { name: level >= 4 ? "묶음 진행" : "프레이즈 진행" })).toHaveAttribute("aria-valuenow", "1");
  }
  expect(remote).toEqual([]);
  const runs = (await readDeviceJournal(page))!.runs;
  for (let level = 1; level <= 5; level++) {
    const run = runs.find(value => value.level === level)!;
    expect([run.nextUnit, run.nextPhrase, run.confirmedCycles]).toEqual(level >= 4 ? [1, 2, 0] : [1, 1, 0]);
  }
});

for (const level of [6, 7, 8] as const) test(`rapid level ${level} pauses, resumes, saves one line offline and reloads at the next line`, async ({ page, context }) => {
  await page.clock.install({ time: new Date("2026-09-10T00:00:00Z") });
  await page.request.post("/api/auth", { data: { password: "integration-beta-password" } });
  await openLearnerPage(page, `/player?lesson=10000000-0000-4000-8000-000000000001&level=${level}&stage=${level * 2 - 1}`);
  const remote: string[] = [];
  page.on("request", request => { if (/\/api\/learner\/(practice|preferences)|\/api\/lessons\/.*\/audio\//.test(request.url())) remote.push(new URL(request.url()).pathname); });
  const canvas = page.getByRole("region", { name: "속사포 학습" });
  await context.setOffline(true);
  await page.getByRole("button", { name: "CONTINUE · 문장 시작", exact: true }).click();
  await advanceCloudClock(page, 100);
  await page.getByRole("button", { name: "PAUSE · 일시정지", exact: true }).click();
  await expect(page.getByRole("button", { name: "CONTINUE · 계속 재생", exact: true })).toBeVisible();
  await advanceCloudClock(page, 5000);
  await page.getByRole("button", { name: "CONTINUE · 계속 재생", exact: true }).click();
  await advanceCloudClock(page, 6000);
  await expect(canvas).toHaveText("한 문장 완료");
  await context.setOffline(false);
  await page.reload();
  await expect(page.getByRole("progressbar", { name: "문장 진행" })).toHaveAttribute("aria-valuenow", "1");
  const run = (await readDeviceJournal(page))!.runs.find(value => value.level === level)!;
  expect([run.nextUnit, run.nextPhrase]).toEqual([1, 1]);
  expect(remote).toEqual([]);
});

test("rapid local-write failure holds the line until retry commits the same boundary", async ({ page }) => {
  await page.clock.install({ time: new Date("2026-09-10T00:00:00Z") });
  await page.request.post("/api/auth", { data: { password: "integration-beta-password" } });
  await openLearnerPage(page, "/player?lesson=10000000-0000-4000-8000-000000000001&level=6&stage=11");
  await page.evaluate(() => {
    const original = IDBObjectStore.prototype.put;
    IDBObjectStore.prototype.put = function(...args: Parameters<IDBObjectStore["put"]>) {
      if (this.name === "accounts") throw new DOMException("Fixture quota failure", "QuotaExceededError");
      return original.apply(this, args);
    };
    window.addEventListener("restore-storage", () => { IDBObjectStore.prototype.put = original; }, { once: true });
  });
  await page.getByRole("button", { name: "CONTINUE · 문장 시작", exact: true }).click();
  await advanceCloudClock(page, 4000);
  await expect(page.getByRole("alert", { name: "기기 저장 알림" })).toBeVisible();
  await expect(page.getByRole("progressbar", { name: "문장 진행" })).toHaveAttribute("aria-valuenow", "0");
  expect((await readDeviceJournal(page))!.studyDays).toEqual([]);
  await page.evaluate(() => window.dispatchEvent(new Event("restore-storage")));
  await page.getByRole("button", { name: "기기 저장 재시도" }).click();
  await expect(page.getByRole("button", { name: "CONTINUE · 다음 문장", exact: true })).toBeVisible();
  await page.reload();
  const journal = (await readDeviceJournal(page))!;
  expect(journal.runs.find(value => value.level === 6)!.nextUnit).toBe(1);
  expect(journal.studyDays).toEqual(["2026-09-10"]);
});

test("saved automatic grouped settings drive offline boundaries and survive reload", async ({ page, context }) => {
  await page.request.post("/api/auth", { data: { password: "integration-beta-password" } });
  await page.goto("/languages");
  await loadPackageModules(page);
  await expect.poll(() => page.evaluate(() => Boolean(window.deviceAccess.readDeviceAccess()))).toBe(true);
  await page.evaluate(async () => {
    const access = window.deviceAccess.readDeviceAccess()!;
    await window.deviceStore.writeDeviceLearningSettings(access.accountId, 4, { mode: "automatic", groupSize: 3, advanceDelayMs: 0, groupGapMs: 0 }, access);
  });
  await openLearnerPage(page, "/player?lesson=10000000-0000-4000-8000-000000000002&level=4&stage=7");
  const remote: string[] = [];
  page.on("request", request => { if (/\/api\/learner\/(practice|preferences)|\/api\/lessons\/.*\/audio\//.test(request.url())) remote.push(new URL(request.url()).pathname); });
  await context.setOffline(true);
  await page.getByRole("button", { name: "CONTINUE · 첫 원음 듣기", exact: true }).click();
  await page.getByRole("button", { name: "NEXT · 다음 묶음", exact: true }).click({ timeout: 15000 });
  await expect(page.getByRole("progressbar", { name: "묶음 진행" })).toHaveAttribute("aria-valuenow", "1", { timeout: 15000 });
  await context.setOffline(false);
  await page.reload();
  await expect(page.getByRole("button", { name: /^재생 모드 및 속도: 자동/ })).toBeVisible();
  const run = (await readDeviceJournal(page))!.runs.find(value => value.level === 4)!;
  expect([run.nextUnit, run.nextPhrase, run.settings.mode, run.settings.groupSize, run.settings.advanceDelayMs, run.settings.groupGapMs]).toEqual([1, 3, "automatic", 3, 0, 0]);
  expect(remote).toEqual([]);
});

test("automatic rapid settings complete offline with one durable completion identity", async ({ page, context }) => {
  await page.clock.install({ time: new Date("2026-09-10T00:00:00Z") });
  await page.request.post("/api/auth", { data: { password: "integration-beta-password" } });
  await page.goto("/languages"); await loadPackageModules(page);
  await expect.poll(() => page.evaluate(() => Boolean(window.deviceAccess.readDeviceAccess()))).toBe(true);
  await page.evaluate(async () => {
    const access = window.deviceAccess.readDeviceAccess()!;
    await window.deviceStore.writeDeviceLearningSettings(access.accountId, 8, { mode: "automatic", wpmLevel: 6, speakingExtraMs: 0, lineGapMs: 0, sectionGapMs: 0 }, access);
  });
  await openLearnerPage(page, "/player?lesson=10000000-0000-4000-8000-000000000001&level=8&stage=15");
  const runId = new URL(page.url()).searchParams.get("run");
  const remote: string[] = [];
  page.on("request", request => { if (/\/api\/learner\/(practice|preferences)|\/api\/lessons\/.*\/audio\//.test(request.url())) remote.push(new URL(request.url()).pathname); });
  await context.setOffline(true);
  await page.getByRole("button", { name: "CONTINUE · 문장 시작", exact: true }).click();
  await advanceCloudClock(page, 10000);
  await expect(page.getByRole("heading", { name: "레벨 8 학습 완료" })).toBeVisible();
  await context.setOffline(false); await page.reload();
  await expect(page.getByRole("heading", { name: "레벨 8 학습 완료" })).toBeVisible();
  const record = await readDeviceJournal(page);
  expect(record!.history.filter(value => value.runId === runId)).toHaveLength(1);
  expect(record!.history.find(value => value.runId === runId)?.settings).toMatchObject({ mode: "automatic", wpmLevel: 6, speakingExtraMs: 0, lineGapMs: 0, sectionGapMs: 0 });
  expect(remote).toEqual([]);
});
