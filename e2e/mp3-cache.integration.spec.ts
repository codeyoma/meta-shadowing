import { createHash } from "node:crypto";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createClient } from "@supabase/supabase-js";
import { expect, test, signInFixtureAdmin, type Page } from "./fixtures/cloud-ui";
import { loadPackageModules } from "./fixtures/package-store";
import { enterAccountPractice } from "./fixtures/cloud-navigation";
import { assertLocalSupabaseUrl } from "./fixtures/local-supabase-google";
import { testMp3 } from "./fixtures/mp3";
import { testRecording } from "./fixtures/audio";

// Routed TTL/LRU/streaming are superseded. Standalone mp3-cache unit tests keep
// the old module contract; package quota/corruption/account tests are consolidated
// in lesson-packages.spec.ts, not skipped or bypassed here.
async function publication(page: Page, format: "mp3" | "webm") {
  const url = process.env.SUPABASE_INTEGRATION_URL!; assertLocalSupabaseUrl(url);
  const service = createClient(url, process.env.SUPABASE_INTEGRATION_SECRET_KEY!, { auth: { persistSession: false, autoRefreshToken: false } });
  await signInFixtureAdmin(page);
  const accountId = (await (await page.request.get("/api/learner/preferences")).json()).profile.accountId as string;
  const response = await page.request.post("/api/admin/drafts", { multipart: { title: "Media package", language: "english",
    scriptFile: { name: "script.txt", mimeType: "text/plain", buffer: Buffer.from("Hello.\n안녕.\nGoodbye.\n잘 가요.") } } });
  expect(response.status()).toBe(201);
  const { draftId: lessonId } = await response.json();
  const bytes = format === "mp3" ? testMp3 : testRecording, mimeType = format === "mp3" ? "audio/mpeg" : "audio/webm";
  const paths = [1, 2].map(number => accountId + "/" + lessonId + "/" + String(number).padStart(3, "0") + "." + format);
  for (const path of paths) expect((await service.storage.from("lesson-audio").upload(path, bytes, { contentType: mimeType })).error).toBeNull();
  expect((await page.request.post("/api/admin/drafts/" + lessonId + "/publish")).status()).toBe(200);
  const row = await service.from("lesson_drafts").select("published_at").eq("id", lessonId).single();
  return { accountId, lessonId: lessonId as string, version: row.data!.published_at as string, service,
    cleanup: () => service.storage.from("lesson-audio").remove([...paths, accountId + "/" + lessonId + "/verified/" + createHash("sha256").update(bytes).digest("hex") + "." + format]) };
}

for (const format of ["mp3", "webm"] as const) test(format + " requires a complete download and retained packages have no TTL or streaming fallback", async ({ page, context }) => {
  const fixture = await publication(page, format);
  const args = { accountId: fixture.accountId, lessonId: fixture.lessonId, version: fixture.version };
  try {
    await page.goto("/player?lesson=" + fixture.lessonId + "&level=1&stage=1");
    await expect(page.getByText("이 레슨 전체를 다운로드해 주세요.", { exact: true })).toBeVisible();
    await expect(page.locator("audio")).toHaveCount(0);
    await enterAccountPractice(page);
    await expect(page.locator("audio")).toHaveAttribute("src", /^blob:/);
    await page.evaluate(async () => {
      localStorage.setItem("meta-shadowing:legacy-sentinel", "preserve");
      await (await caches.open("unrelated-app")).put("/unrelated-fixture", new Response("preserve"));
    });
    const later = await context.newPage();
    try {
      await later.goto("/languages"); await loadPackageModules(later);
      await later.clock.setFixedTime(new Date(Date.now() + 365 * 86400_000));
      await context.setOffline(true);
      expect(await later.evaluate(async ({ accountId, lessonId, version }) =>
        (await window.packageStore.readLessonPackage(accountId, lessonId, version))?.audio.length, args)).toBe(2);
      await later.evaluate(id => window.packageStore.deleteLessonPackage(id), fixture.lessonId);
      expect(await later.evaluate(() => localStorage.getItem("meta-shadowing:legacy-sentinel"))).toBe("preserve");
      expect(await later.evaluate(() => caches.keys())).toContain("unrelated-app");
    } finally { await context.setOffline(false); await later.close(); }
  } finally { await fixture.cleanup(); }
});

test("installed media preserves the fresh-gesture recovery path without requesting audio", async ({ page }) => {
  const fixture = await publication(page, "mp3");
  try {
    await page.goto("/player?lesson=" + fixture.lessonId + "&level=1&stage=1"); await enterAccountPractice(page);
    await page.evaluate(() => {
      let inClick = false, firstAttempt = true;
      document.addEventListener("click", () => { inClick = true; setTimeout(() => { inClick = false; }, 0); }, true);
      const original = HTMLMediaElement.prototype.play;
      HTMLMediaElement.prototype.play = function () {
        // Local playback starts in the initial click now. Explicitly model the
        // browser rejecting that first attempt, then require a fresh tap.
        if (firstAttempt) { firstAttempt = false; return Promise.reject(new DOMException("Fixture autoplay rejection", "NotAllowedError")); }
        return inClick ? original.call(this) : Promise.reject(new DOMException("Fresh tap required", "NotAllowedError"));
      };
    });
    let requests = 0;
    page.on("request", request => { if (request.url().includes("/audio/")) requests++; });
    await page.getByRole("button", { name: /첫 원음 듣기/ }).click();
    await expect(page.getByRole("button", { name: /계속 재생/ })).toBeVisible();
    await expect(page.getByLabel("완료한 듣기")).toContainText("필수 0 / 3");
    await page.getByRole("button", { name: /계속 재생/ }).click();
    await expect(page.getByRole("button", { name: /듣기 완료 확인/ })).toBeVisible();
    expect(requests).toBe(0);
  } finally { await fixture.cleanup(); }
});

test("retained audio access API keeps authentication, privacy, publication and version boundaries", async ({ page, browser, baseURL }) => {
  const fixture = await publication(page, "mp3");
  const accessUrl = "/api/lessons/" + fixture.lessonId + "/audio/1/access?version=" + encodeURIComponent(fixture.version);
  try {
    const outsider = await browser.newContext({ baseURL, ignoreHTTPSErrors: true });
    try {
      expect((await outsider.request.get(accessUrl)).status()).toBe(401);
      await outsider.request.post("/api/auth", { data: { password: "integration-beta-password" } });
      expect((await outsider.request.get(accessUrl)).status()).toBe(401);
    } finally { await outsider.close(); }
    const grant = await page.request.get(accessUrl);
    expect(grant.status()).toBe(200);
    expect(grant.headers()["cache-control"]).toBe("private, no-store");
    expect(Object.keys(await grant.json()).sort()).toEqual(["accountId", "audioId", "format", "lessonId", "version"]);
    expect((await page.request.get(accessUrl.replace("/audio/1/", "/audio/999/"))).status()).toBe(404);
    expect((await fixture.service.from("lesson_drafts").update({ publication_status: "unpublished" }).eq("id", fixture.lessonId)).error).toBeNull();
    expect((await page.request.get(accessUrl)).status()).toBe(404);
    expect((await fixture.service.from("lesson_drafts").update({ publication_status: "published", published_at: new Date(Date.now() + 20000).toISOString() }).eq("id", fixture.lessonId)).error).toBeNull();
    expect((await page.request.get(accessUrl)).status()).toBe(404);
  } finally { await fixture.cleanup(); }
});

test("a verified package survives a complete browser-process restart and reads offline", async ({ page, browser, baseURL }) => {
  const fixture = await publication(page, "mp3");
  const profile = await mkdtemp(join(tmpdir(), "package-restart-"));
  const launch = () => browser.browserType().launchPersistentContext(profile, { baseURL, ignoreHTTPSErrors: true,
    executablePath: process.env.PLAYWRIGHT_CHROME_EXECUTABLE, args: process.platform === "darwin" ? ["--disable-updater-scheduler"] : [] });
  let context: Awaited<ReturnType<typeof launch>> | undefined;
  const args = { accountId: fixture.accountId, lessonId: fixture.lessonId, version: fixture.version };
  try {
    context = await launch(); await context.addCookies(await page.context().cookies());
    let tab = await context.newPage(); await tab.goto("/languages"); await loadPackageModules(tab);
    await tab.evaluate(({ accountId, lessonId, version }) => window.packageDownloader.createLessonPackageDownloader(accountId).download({ id: lessonId, version }), args);
    await context.close(); context = await launch();
    tab = await context.newPage(); await tab.goto("/languages"); await loadPackageModules(tab);
    await context.setOffline(true);
    expect(await tab.evaluate(async ({ accountId, lessonId, version }) => (await window.packageStore.readLessonPackage(accountId, lessonId, version))?.audio.length, args)).toBe(2);
  } finally { await context?.close(); await fixture.cleanup(); await rm(profile, { recursive: true, force: true }); }
});
