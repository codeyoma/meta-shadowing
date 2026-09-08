import { enterAccountPractice } from "./fixtures/cloud-navigation";
import { randomUUID } from "node:crypto";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, test, type BrowserContext, type Page } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import { createServerClient } from "@supabase/ssr";
import { assertLocalSupabaseUrl, promoteLocalSessionToGoogle } from "./fixtures/local-supabase-google";
import { testMp3 } from "./fixtures/mp3";
import { testRecording } from "./fixtures/audio";
import { confirmManualListen } from "./fixtures/manual-practice";

test.skip(process.env.ADMIN_SUPABASE_INTEGRATION !== "1", "requires real local Supabase");
async function cacheMetadata(page: Page) {
  return page.evaluate(() => new Promise<{ key: string; format: string; size: number; createdAt: number; lastPlayedAt: number | null; expiresAt: number; fields: string[] }[]>((resolve, reject) => {
    const request = indexedDB.open("meta-shadowing-mp3-v1", 1);
    request.onerror = () => reject(request.error);
    request.onsuccess = () => {
      const database = request.result;
      const read = database.transaction("entries").objectStore("entries").getAll();
      read.onsuccess = () => { database.close(); resolve(read.result.map(({ bytes: _bytes, ...entry }) => ({ ...entry, fields: [...Object.keys(entry), "bytes"].sort() }))); };
      read.onerror = () => { database.close(); reject(read.error); };
    };
  }));
}

for (const scenario of ["restart and retention", "expiry during access check", "non-MP3 streaming", "capacity cleanup", "quota failure", "storage unavailable", "invalid bytes", "gesture preparation", "access and accounts"] as const) test(`MP3 cache: ${scenario}`, async ({ browser, baseURL, viewport, isMobile, hasTouch, deviceScaleFactor, userAgent }, testInfo) => {
  test.setTimeout(120000);
  const url = process.env.SUPABASE_INTEGRATION_URL!; assertLocalSupabaseUrl(url);
  const key = process.env.SUPABASE_INTEGRATION_PUBLISHABLE_KEY!;
  const options = { auth: { persistSession: false, autoRefreshToken: false } };
  const service = createClient(url, process.env.SUPABASE_INTEGRATION_SECRET_KEY!, options);
  const email = `mp3-${randomUUID()}@example.com`, password = randomUUID();
  const { data: created, error } = await service.auth.admin.createUser({ email, password, email_confirm: true });
  expect(error).toBeNull();
  const id = created.user!.id, lessonId = randomUUID();
  const users = [id];
  let version = new Date().toISOString();
  const client = createClient(url, key, options);
  await client.auth.signInWithPassword({ email, password });
  const session = await promoteLocalSessionToGoogle(url, service, client, id, "learner");
  const profile = await mkdtemp(join(tmpdir(), "mp3-cache-browser-"));
  const launch = () => browser.browserType().launchPersistentContext(profile, {
    baseURL, ignoreHTTPSErrors: true, viewport, isMobile, hasTouch, deviceScaleFactor, userAgent,
    executablePath: process.env.PLAYWRIGHT_CHROME_EXECUTABLE,
    args: process.platform === "darwin" ? ["--disable-updater-scheduler"] : [],
  });
  let context: BrowserContext | undefined;
  const extension = scenario === "non-MP3 streaming" ? "webm" : "mp3";
  const recording = extension === "webm" ? testRecording : testMp3;
  const contentType = extension === "webm" ? "audio/webm" : "audio/mpeg";
  const paths = [1, 2].map(n => `${id}/${lessonId}/${n}.${extension}`);
  const errors: string[] = [];
  const playerUrl = `/player?lesson=${lessonId}&level=1&stage=1&mode=manual`;
  const listen = async (page: Page) => {
    await page.getByRole("button", { name: /첫 원음 듣기|계속 재생|다시 시도/ }).click();
    await expect(page.getByRole("button", { name: /듣기 완료 확인/ })).toBeVisible();
  };
  try {
    for (const path of paths) expect((await service.storage.from("lesson-audio").upload(path, recording, { contentType })).error).toBeNull();
    const seeded = await service.from("lesson_drafts").insert({ id: lessonId, created_by: id, title: "MP3 cache fixture", language: "english",
      target_filename: "en.txt", korean_filename: "ko.txt", target_source: "Hello", korean_source: "안녕", parsed_entries: [1, 2].map(n => ({ kind: "phrase", sourceLine: n, phraseNumber: n, target: `Hello ${n}.`, korean: `안녕 ${n}.` })),
      validation_status: "validated", phrase_count: 2, chapter_count: 0, section_count: 0, publication_status: "published", published_at: version,
      audio_manifest: paths.map((path, i) => ({ phraseNumber: i + 1, path, canonicalName: `${i + 1}.${extension}`, size: recording.length, contentType })) }).select("published_at").single();
    expect(seeded.error).toBeNull();
    version = seeded.data!.published_at;
    context = await launch();
    const cookies = createServerClient(url, key, { cookies: { getAll: () => [], setAll: async values => {
      await context!.addCookies(values.map(value => ({ name: value.name, value: value.value, url: baseURL!, sameSite: "Lax" as const, expires: Math.floor(Date.now() / 1000) + 86400 * 365 })));
    } } });
    await cookies.auth.setSession(session);
    await context.request.post("/api/auth", { data: { password: "integration-beta-password" } });
    let page = await context.newPage();
    page.on("pageerror", error => errors.push(error.message));
    if (scenario === "quota failure") {
      await page.addInitScript(() => {
        const original = IDBObjectStore.prototype.put;
        IDBObjectStore.prototype.put = function (...args: Parameters<typeof original>) {
          if (this.transaction.db.name === "meta-shadowing-mp3-v1") throw new DOMException("Fixture quota exhausted", "QuotaExceededError");
          return original.apply(this, args);
        };
      });
    }
    if (scenario === "storage unavailable") await page.addInitScript(() => {
      const original = IDBFactory.prototype.open;
      IDBFactory.prototype.open = function (name, version) {
        if (name === "meta-shadowing-mp3-v1") throw new DOMException("Fixture storage blocked", "SecurityError");
        return original.call(this, name, version);
      };
    });
    const initialTime = Date.now();
    let releaseNext = () => {}, nextHeld = Promise.resolve();
    if (scenario === "non-MP3 streaming") {
      let first = true, held!: () => void;
      const pending = new Promise<void>(resolve => { releaseNext = resolve; });
      nextHeld = new Promise<void>(resolve => { held = resolve; });
      await page.route("**/api/lessons/*/audio/2?*", async route => {
        if (!first) return route.continue();
        first = false;
        const response = await route.fetch();
        held(); await pending;
        await route.fulfill({ response }).catch(() => {}); // selection may abort prefetch
      });
    }
    await page.clock.setFixedTime(new Date(initialTime));
    await page.goto(playerUrl); await enterAccountPractice(page);
    expect((await context.request.get(`/api/lessons/${lessonId}/audio/1/access?version=${encodeURIComponent(version)}`)).status()).toBe(200);
    if (scenario === "non-MP3 streaming") {
      try {
        await expect(page.locator("audio")).toHaveAttribute("src", /^\/api\/lessons\//);
        await nextHeld;
        await listen(page);
        for (let cycle = 0; cycle < 3; cycle++) await confirmManualListen(page);
        await page.getByRole("button", { name: /다음 프레이즈/ }).click();
        await expect(page.locator("audio")).toHaveAttribute("src", /\/audio\/2\?/);
        await listen(page);
        expect(await cacheMetadata(page)).toEqual([]);
        expect(errors).toEqual([]);
      } finally { releaseNext(); }
      return;
    }
    if (scenario === "quota failure" || scenario === "storage unavailable") {
      await listen(page);
      await page.getByRole("button", { name: /듣기 완료 확인/ }).click();
      await expect(page.getByLabel("완료한 듣기")).toContainText("필수 1 / 3");
      if (scenario === "quota failure") expect(await cacheMetadata(page)).toEqual([]);
      else expect(await page.evaluate(async () => (await indexedDB.databases()).map(database => database.name))).not.toContain("meta-shadowing-mp3-v1");
      expect(errors).toEqual([]);
      return;
    }
    await expect.poll(async () => (await cacheMetadata(page)).length).toBe(2);
    if (scenario === "expiry during access check") {
      await page.clock.setFixedTime(new Date(initialTime + 1728000000 - 1));
      let release!: () => void, held!: () => void, intercept = true, downloads = 0;
      const pending = new Promise<void>(resolve => { release = resolve; });
      const intercepted = new Promise<void>(resolve => { held = resolve; });
      page.on("request", request => { if (request.url().includes("/storage/v1/object/sign/lesson-audio/")) downloads++; });
      await page.route("**/audio/1/access?*", async route => {
        if (!intercept) return route.continue();
        intercept = false;
        const response = await route.fetch();
        held(); await pending;
        await route.fulfill({ response });
      });
      await page.getByRole("button", { name: /첫 원음 듣기/ }).click();
      await intercepted;
      await page.clock.setFixedTime(new Date(initialTime + 1728000000));
      release();
      await expect(page.getByRole("button", { name: /듣기 완료 확인/ })).toBeVisible();
      expect(downloads).toBe(1);
      expect((await cacheMetadata(page)).find(entry => JSON.parse(entry.key)[3] === "1.mp3")?.createdAt).toBe(initialTime + 1728000000);
      expect(errors).toEqual([]);
      return;
    }
    if (scenario === "invalid bytes") {
      await page.evaluate(() => new Promise<void>((resolve, reject) => {
        const opened = indexedDB.open("meta-shadowing-mp3-v1", 1);
        opened.onsuccess = () => {
          const database = opened.result, transaction = database.transaction("entries", "readwrite"), store = transaction.objectStore("entries");
          const read = store.getAll();
          read.onsuccess = () => {
            const entry = read.result.find(entry => JSON.parse(entry.key)[3] === "1.mp3");
            store.put({ ...entry, size: 3, bytes: new Blob(["bad"], { type: "audio/mpeg" }) });
          };
          transaction.oncomplete = () => { database.close(); resolve(); };
          transaction.onerror = () => { database.close(); reject(transaction.error); };
        };
      }));
      let downloads = 0;
      page.on("request", request => { if (request.url().includes("/storage/v1/object/sign/lesson-audio/")) downloads++; });
      await page.reload();
      if (new URL(page.url()).pathname === "/player") await enterAccountPractice(page); await listen(page);
      expect(downloads).toBe(1); // discard only the damaged entry, not its neighbor
      for (const fault of ["partial", "auth-document", "corrupt", "incomplete"] as const) {
        await page.evaluate(() => new Promise<void>((resolve, reject) => {
          const request = indexedDB.deleteDatabase("meta-shadowing-mp3-v1"); request.onsuccess = () => resolve(); request.onerror = () => reject(request.error);
        }));
        // Intercept the initial request: Playwright routes do not re-match redirects.
        const route = "**/api/lessons/*/audio/*";
        await page.route(route, request => request.fulfill({ status: fault === "partial" ? 206 : 200,
          headers: { "content-type": fault === "auth-document" ? "text/html" : "audio/mpeg", ...(fault === "partial" ? { "content-range": "bytes 0-20/100" } : {}), ...(fault === "incomplete" ? { "content-length": "99999" } : {}) },
          body: fault === "auth-document" ? Buffer.from("<html>Login required</html>") : fault === "corrupt" ? Buffer.from("ID3broken") : testMp3,
        }));
        await page.reload();
      if (new URL(page.url()).pathname === "/player") await enterAccountPractice(page);
        await page.getByRole("button", { name: /첫 원음 듣기/ }).click();
        await expect(page.getByRole("button", { name: /RETRY/ })).toBeVisible();
        await expect(page.getByLabel("완료한 듣기")).toContainText("필수 0 / 3");
        expect(await cacheMetadata(page)).toEqual([]);
        await page.unroute(route);
      }
      await page.reload();
      if (new URL(page.url()).pathname === "/player") await enterAccountPractice(page); await listen(page);
      await expect.poll(async () => (await cacheMetadata(page)).length).toBe(2);
      expect(errors).toEqual([]);
      return;
    }
    const prefetched = await cacheMetadata(page);
    if (scenario === "capacity cleanup") {
      await page.evaluate(({ template, now }) => new Promise<void>((resolve, reject) => {
        const opened = indexedDB.open("meta-shadowing-mp3-v1", 1);
        opened.onsuccess = () => {
          const database = opened.result, transaction = database.transaction("entries", "readwrite"), store = transaction.objectStore("entries");
          for (const [name, size, created, played] of [
            ["expired", 10, now - 1728000000, null],
            ["oldest-played", 30 * 1024 * 1024, now - 10000, now - 8000],
            ["unplayed", 50 * 1024 * 1024, now - 5000, null],
            ["recently-played", 40 * 1024 * 1024, now - 10000, now - 1000],
          ] as const) {
            const key = JSON.stringify([...JSON.parse(template.key).slice(0, 3), `${name}.mp3`]);
            store.put({ key, format: "audio/mpeg", size, bytes: new Blob([new Uint8Array(size)], { type: "audio/mpeg" }), createdAt: created, lastPlayedAt: played, expiresAt: (played ?? created) + 1728000000 });
          }
          transaction.oncomplete = () => { database.close(); resolve(); };
          transaction.onerror = () => { database.close(); reject(transaction.error); };
        };
      }), { template: prefetched[0], now: initialTime });
      await page.reload();
      if (new URL(page.url()).pathname === "/player") await enterAccountPractice(page);
      await expect.poll(async () => (await cacheMetadata(page)).reduce((total, entry) => total + entry.size, 0)).toBeLessThanOrEqual(104857600);
      const remaining = (await cacheMetadata(page)).map(entry => JSON.parse(entry.key)[3]);
      expect(remaining).not.toContain("expired.mp3"); expect(remaining).not.toContain("oldest-played.mp3");
      expect(remaining).toContain("unplayed.mp3"); expect(remaining).toContain("recently-played.mp3");
      await listen(page); expect(errors).toEqual([]);
      return;
    }
    expect(prefetched.every(entry => entry.lastPlayedAt === null && entry.createdAt === initialTime && entry.expiresAt === initialTime + 1728000000)).toBe(true);
    expect(prefetched[0].fields).toEqual(["bytes", "createdAt", "expiresAt", "format", "key", "lastPlayedAt", "size"]);
    if (scenario === "gesture preparation") {
      await page.evaluate(() => {
        let inClick = false;
        // A microtask can run between native listeners; activation spans this task.
        document.addEventListener("click", () => { inClick = true; setTimeout(() => { inClick = false; }, 0); }, true);
        const original = HTMLMediaElement.prototype.play;
        HTMLMediaElement.prototype.play = function () {
          return inClick ? original.call(this) : Promise.reject(new DOMException("Fixture requires a fresh tap", "NotAllowedError"));
        };
      });
      await page.getByRole("button", { name: /첫 원음 듣기/ }).click();
      await expect(page.getByRole("button", { name: /계속 재생/ })).toBeVisible();
      expect((await cacheMetadata(page)).every(entry => entry.lastPlayedAt === null)).toBe(true);
      await page.getByRole("button", { name: /계속 재생/ }).click();
      await expect(page.getByRole("button", { name: /듣기 완료 확인/ })).toBeVisible();
      await expect.poll(async () => (await cacheMetadata(page)).filter(entry => entry.lastPlayedAt !== null).length).toBe(1);
      expect(errors).toEqual([]);
      return;
    }
    await page.clock.setFixedTime(new Date(initialTime + 10000));
    await listen(page);
    await expect.poll(() => page.locator("audio").getAttribute("src")).toMatch(/^blob:/);
    await expect.poll(async () => (await cacheMetadata(page)).filter(entry => entry.lastPlayedAt === initialTime + 10000).length).toBe(1);
    if (scenario === "access and accounts") {
      const accessUrl = `/api/lessons/${lessonId}/audio/1/access?version=${encodeURIComponent(version)}`;
      const outsider = await browser.newContext({ baseURL, ignoreHTTPSErrors: true });
      try {
        expect((await outsider.request.get(accessUrl)).status()).toBe(401);
        await outsider.request.post("/api/auth", { data: { password: "integration-beta-password" } });
        expect((await outsider.request.get(accessUrl)).status()).toBe(401);
      } finally { await outsider.close(); }
      const grant = await context.request.get(accessUrl);
      expect(grant.headers()["cache-control"]).toBe("private, no-store");
      expect(Object.keys(await grant.json()).sort()).toEqual(["accountId", "audioId", "format", "lessonId", "version"]);
      expect((await context.request.get(accessUrl.replace("/audio/1/", "/audio/999/"))).status()).toBe(404);
      // Loop real audio to observe revocation while a recording is still playing.
      await page.locator("audio").evaluate((audio: HTMLAudioElement) => { audio.loop = true; });
      await page.getByRole("button", { name: /듣기 완료 확인/ }).click();
      await expect(page.locator("audio")).toHaveJSProperty("paused", false);
      expect((await service.from("lesson_drafts").update({ publication_status: "unpublished" }).eq("id", lessonId)).error).toBeNull();
      await expect(page.getByRole("alert", { name: "학습 저장 알림" })).toBeVisible({ timeout: 12000 });
      await expect(page.locator("audio")).toHaveJSProperty("paused", true);
      expect((await context.request.get(accessUrl)).status()).toBe(404);
      const replaced = await service.from("lesson_drafts").update({ publication_status: "published", published_at: new Date(initialTime + 20000).toISOString() }).eq("id", lessonId).select("published_at").single();
      expect(replaced.error).toBeNull();
      expect((await context.request.get(accessUrl)).status()).toBe(404);
      // Republishing cannot revive the old version's cloud run or audio grant.
      await expect(page.getByRole("group", { name: "학습 진행", exact: true }).getByRole("button").first()).toBeDisabled();
      await expect(page.locator("audio")).toHaveJSProperty("paused", true);
      version = replaced.data!.published_at;
      await page.reload();
      if (new URL(page.url()).pathname === "/player") await enterAccountPractice(page); await listen(page);
      await page.evaluate(async () => {
        localStorage.setItem("meta-shadowing:legacy-sentinel", "preserve");
        await (await caches.open("unrelated-app")).put("/unrelated-fixture", new Response("preserve"));
      });
      await context.addInitScript(() => {
        const original = IDBObjectStore.prototype.delete;
        IDBObjectStore.prototype.delete = function (key) {
          if (this.transaction.db.name === "meta-shadowing-mp3-v1" && (window as typeof window & { failCacheCleanup?: boolean }).failCacheCleanup) throw new DOMException("Fixture cleanup failure", "UnknownError");
          return original.call(this, key);
        };
        (window as typeof window & { failCacheCleanup?: boolean }).failCacheCleanup = /sb-.*auth-token/.test(document.cookie);
      });
      await page.reload();
      if (new URL(page.url()).pathname === "/player") await enterAccountPractice(page); await listen(page);
      const secondEmail = `mp3-second-${randomUUID()}@example.com`, secondPassword = randomUUID();
      const secondUser = await service.auth.admin.createUser({ email: secondEmail, password: secondPassword, email_confirm: true });
      expect(secondUser.error).toBeNull(); const secondId = secondUser.data.user!.id; users.push(secondId);
      const secondClient = createClient(url, key, options);
      await secondClient.auth.signInWithPassword({ email: secondEmail, password: secondPassword });
      const secondSession = await promoteLocalSessionToGoogle(url, service, secondClient, secondId, "learner");
      await cookies.auth.setSession(secondSession);
      await page.getByRole("button", { name: /듣기 완료 확인/ }).click();
      await expect(page.getByRole("alert", { name: "학습 저장 알림" })).toContainText("다시 로그인");
      await expect(page.locator("audio")).toHaveCount(0);
      expect((await cacheMetadata(page)).some(entry => JSON.parse(entry.key)[0] === id)).toBe(true);
      let downloads = 0;
      page.on("request", request => { if (request.url().includes("/storage/v1/object/sign/lesson-audio/")) downloads++; });
      await page.reload();
      if (new URL(page.url()).pathname === "/player") await enterAccountPractice(page); await listen(page);
      expect(downloads).toBeGreaterThanOrEqual(2);
      expect((await cacheMetadata(page)).some(entry => JSON.parse(entry.key)[0] === secondId)).toBe(true);
      expect(await page.evaluate(() => localStorage.getItem("meta-shadowing:legacy-sentinel"))).toBe("preserve");
      await context.clearCookies();
      await page.reload();
      if (new URL(page.url()).pathname === "/player") await enterAccountPractice(page);
      await expect(page).toHaveURL(/\/(login)?$/);
      await expect.poll(async () => (await cacheMetadata(page)).length).toBe(0);
      expect(await page.evaluate(() => localStorage.getItem("meta-shadowing:legacy-sentinel"))).toBe("preserve");
      expect(await page.evaluate(() => caches.keys())).toContain("unrelated-app");
      expect(errors).toEqual([]);
      return;
    }
    await context.close(); context = await launch();
    page = await context.newPage();
    page.on("pageerror", error => errors.push(error.message));
    await page.clock.setFixedTime(new Date(initialTime + 60000));
    let downloads = 0, checks = 0;
    page.on("request", request => {
      if (request.url().includes("/storage/v1/object/sign/lesson-audio/")) downloads++;
      if (request.url().includes("/audio/1/access?")) checks++;
    });
    await page.goto(playerUrl); await enterAccountPractice(page);
    await listen(page);
    expect(downloads).toBe(0);
    expect(checks).toBeGreaterThan(0);
    await expect.poll(async () => (await cacheMetadata(page)).filter(entry => entry.lastPlayedAt === initialTime + 60000).length).toBe(1);
    await page.clock.setFixedTime(new Date(initialTime + 1728000000));
    await page.reload();
      if (new URL(page.url()).pathname === "/player") await enterAccountPractice(page);
    await expect.poll(() => downloads).toBe(1); // only the never-played prefetch expired
    await expect.poll(async () => (await cacheMetadata(page)).filter(entry => entry.createdAt === initialTime + 1728000000).length).toBe(1);
    await page.clock.setFixedTime(new Date(initialTime + 1728060000));
    await page.reload();
      if (new URL(page.url()).pathname === "/player") await enterAccountPractice(page);
    await expect.poll(() => downloads).toBe(2); // the played file expires at its own exact boundary
    await listen(page);
    expect(errors).toEqual([]);
    await page.screenshot({ path: testInfo.outputPath("cached-mp3-playback.png"), animations: "disabled" });
  } finally {
    await context?.close();
    await service.storage.from("lesson-audio").remove(paths);
    for (const user of users.reverse()) await service.auth.admin.deleteUser(user);
  }
});
