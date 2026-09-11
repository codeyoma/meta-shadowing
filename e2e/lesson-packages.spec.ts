import { createClient } from "@supabase/supabase-js";
import { expect, test, signInFixtureAdmin, type Page } from "./fixtures/cloud-ui";
import { assertLocalSupabaseUrl } from "./fixtures/local-supabase-google";
import { loadPackageModules } from "./fixtures/package-store";
import { testRecording } from "./fixtures/audio";
import { createHash } from "node:crypto";
import { randomUUID } from "node:crypto";
import { createServerClient } from "@supabase/ssr";
import { promoteLocalSessionToGoogle } from "./fixtures/local-supabase-google";
import { auditLearningStorage } from "./fixtures/storage-audit";

const bytes = Buffer.from([0x49, 0x44, 0x33, 4, 0, 0, 0, 0, 0, 0, 11, 22, 33, 44]);
const digest = "1fbdf3048de17a9440b45b005613e9ef26e6167029b449956abb37df62c164a5";
async function publishPackage(page: Page, playable = false, script = "Hello.\n안녕하세요.\nGoodbye.\n안녕히 가세요.") {
  const media = playable ? testRecording : bytes;
  const extension = playable ? "webm" : "mp3";
  const contentType = playable ? "audio/webm" : "audio/mpeg";
  const sha256 = playable ? createHash("sha256").update(media).digest("hex") : digest;
  const url = process.env.SUPABASE_INTEGRATION_URL!;
  assertLocalSupabaseUrl(url);
  const service = createClient(url, process.env.SUPABASE_INTEGRATION_SECRET_KEY!, { auth: { persistSession: false, autoRefreshToken: false } });
  await signInFixtureAdmin(page);
  const accountId = (await (await page.request.get("/api/learner/preferences")).json()).profile.accountId;
  const saved = await page.request.post("/api/admin/drafts", { multipart: {
    title: "Package book", language: "english",
    scriptFile: { name: "script.txt", mimeType: "text/plain", buffer: Buffer.from(script) },
  } });
  expect(saved.status()).toBe(201);
  const { draftId } = await saved.json();
  const phraseCount = script.split("\n").length / 2;
  const paths = Array.from({ length: phraseCount }, (_, index) => `${accountId}/${draftId}/${String(index + 1).padStart(3, "0")}.${extension}`);
  for (const path of paths) expect((await service.storage.from("lesson-audio").upload(path, media, { contentType })).error).toBeNull();
  expect((await page.request.post(`/api/admin/drafts/${draftId}/publish`)).status()).toBe(200);
  const row = await service.from("lesson_drafts").select("published_at").eq("id", draftId).single();
  return { accountId, lessonId: draftId as string, version: row.data!.published_at as string, cleanup: async () => {
    await service.storage.from("lesson-audio").remove([...paths, `${accountId}/${draftId}/verified/${sha256}.${extension}`]);
  } };
}

test("authenticated complete package acquisition pins text, every audio, dictionary and persisted analysis", async ({ page, request }) => {
  const fixture = await publishPackage(page);
  try {
    const url = `/api/lessons/${fixture.lessonId}/package?version=${encodeURIComponent(fixture.version)}`;
    const response = await page.request.get(url);
    expect(response.status()).toBe(200);
    expect(response.headers()["cache-control"]).toBe("private, no-store");
    const result = await response.json();
    expect(result.accountId).toBe(fixture.accountId);
    expect(result.manifest).toMatchObject({ schemaVersion: 1, lesson: { id: fixture.lessonId, version: fixture.version, phraseCount: 2 },
      audio: [{ phraseNumber: 1, size: 14, sha256: digest, mimeType: "audio/mpeg" }, { phraseNumber: 2, size: 14, sha256: digest, mimeType: "audio/mpeg" }],
      dictionary: { hello: { status: "unavailable", entries: [] }, goodbye: { status: "unavailable", entries: [] } },
      syntax: [{ phraseNumber: 1, status: "unavailable", sentences: [{ text: "Hello.", status: "pending", tokens: [] }] }, { phraseNumber: 2, status: "unavailable", sentences: [{ text: "Goodbye.", status: "pending", tokens: [] }] }],
    });
    expect(result.manifest.lesson.phrases.map((p: { target: string }) => p.target)).toEqual(["Hello.", "Goodbye."]);
    expect(JSON.stringify(result.manifest)).not.toMatch(/access_token|signedUrl|storage\/v1|created_by/);
    for (let repeat = 0; repeat < 3; repeat++) expect((await (await page.request.get(url)).json()).sha256).toBe(result.sha256);
    expect((await request.get(url)).status()).toBe(401);
    expect((await page.request.get(`/api/lessons/${fixture.lessonId}/package?version=2000-01-01T00:00:00Z`)).status()).toBe(404);
  } finally { await fixture.cleanup(); }
});

test("direct player entry requires the whole package and installed media uses only local blobs", async ({ page }) => {
  const fixture = await publishPackage(page, true);
  try {
    const audioRequests: string[] = [];
    await page.goto(`/player?lesson=${fixture.lessonId}&level=1&stage=1`);
    await expect(page.getByText("이 레슨 전체를 다운로드해 주세요.", { exact: true })).toBeVisible();
    await expect(page.locator("audio")).toHaveCount(0);
    await page.getByRole("button", { name: "Package book 다운로드", exact: true }).click();
    await expect(page.locator("audio")).toHaveAttribute("src", /^blob:/);
    page.on("request", request => { if (/\/audio\/|\/api\/dictionary|\/syntax\//.test(request.url())) audioRequests.push(request.url()); });
    const source = await page.locator("audio").getAttribute("src");
    expect(await page.evaluate(async src => {
      const audio = new Audio(src!);
      await audio.play();
      audio.pause();
      return audio.currentSrc.startsWith("blob:");
    }, source)).toBe(true);
    await page.getByRole("button", { name: "Hello 뜻 보기", exact: true }).click();
    await expect(page.getByRole("dialog", { name: "Hello" })).toBeVisible();
    expect(audioRequests).toEqual([]);
  } finally { await fixture.cleanup(); }
});

test("unchanged package refreshes preserve the active media source and playback", async ({ page }) => {
  const fixture = await publishPackage(page, true);
  try {
    await page.goto(`/player?lesson=${fixture.lessonId}&level=1&stage=1`);
    await page.getByRole("button", { name: "Package book 다운로드", exact: true }).click();
    await expect(page.locator("audio")).toHaveAttribute("src", /^blob:/);
    const source = await page.locator("audio").getAttribute("src");
    await page.evaluate(async () => {
      const audio = document.querySelector("audio")!;
      audio.loop = true;
      await audio.play();
      audio.dataset.resets = "0";
      audio.addEventListener("emptied", () => { audio.dataset.resets = String(Number(audio.dataset.resets) + 1); });
      window.dispatchEvent(new Event("focus"));
      window.dispatchEvent(new CustomEvent("lesson-packages-changed", { detail: { lessonId: "unrelated-lesson" } }));
    });
    // Allow the asynchronous inventory and selected-package byte validation to settle.
    await expect.poll(() => page.locator("audio").evaluate(audio => (audio as HTMLAudioElement).currentTime)).toBeGreaterThan(0.1);
    await expect(page.locator("audio")).toHaveAttribute("src", source!);
    await expect(page.locator("audio")).toHaveAttribute("data-resets", "0");
    expect(await page.locator("audio").evaluate(audio => (audio as HTMLAudioElement).paused)).toBe(false);
  } finally { await fixture.cleanup(); }
});

test("pause during final audio hashing cannot commit readiness or emit ready", async ({ page }) => {
  const fixture = await publishPackage(page);
  try {
    await page.goto("/languages"); await loadPackageModules(page);
    const result = await page.evaluate(async ({ accountId, lessonId, version }) => {
      let finalValidation = false;
      let entered!: () => void, release!: () => void;
      const hashing = new Promise<void>(resolve => { entered = resolve; });
      const held = new Promise<void>(resolve => { release = resolve; });
      const original = Blob.prototype.arrayBuffer;
      Blob.prototype.arrayBuffer = async function () {
        if (finalValidation) { entered(); await held; }
        return original.call(this);
      };
      const states: string[] = [];
      const manager = window.packageDownloader.createLessonPackageDownloader(accountId, (_id, progress) => {
        states.push(progress.state);
        if (progress.state === "downloading" && progress.complete === progress.total) finalValidation = true;
      });
      try {
        const task = manager.download({ id: lessonId, version }).then(() => "ready", () => "cancelled");
        await hashing;
        manager.pause(lessonId);
        finalValidation = false; release();
        const outcome = await task;
        return { outcome, states, installed: !!await window.packageStore.readLessonPackage(accountId, lessonId, version) };
      } finally { release(); Blob.prototype.arrayBuffer = original; manager.dispose(); }
    }, { accountId: fixture.accountId, lessonId: fixture.lessonId, version: fixture.version });
    expect(result.outcome).toBe("cancelled");
    expect(result.states).not.toContain("ready");
    expect(result.states).toContain("paused");
    expect(result.installed).toBe(false);
  } finally { await fixture.cleanup(); }
});

test("public installation resumes verified bytes, requires account grants and deletion preserves settings", async ({ page }) => {
  const fixture = await publishPackage(page);
  try {
    await page.goto("/languages");
    await loadPackageModules(page);
    await expect.poll(() => page.evaluate(accountId =>
      window.deviceAccess.readDeviceAccess()?.accountId === accountId, fixture.accountId)).toBe(true);
    const result = await page.evaluate(async ({ accountId, lessonId, version }) => {
      const store = window.packageStore;
      const { writer } = await window.deviceStore.readDeviceLearningState(window.deviceAccess.readDeviceAccess()!);
      await window.deviceStore.writeDeviceLearningSettings(accountId, 4, { speed: 2 }, writer);
      const downloader = window.packageDownloader.createLessonPackageDownloader(accountId);
      await downloader.download({ id: lessonId, version });
      const installed = await store.readLessonPackage(accountId, lessonId, version);
      const other = await store.readLessonPackage("other-account", lessonId, version);
      await store.invalidatePackageAccount(accountId);
      const retained = await store.readLessonPackage(accountId, lessonId, version);
      await store.deleteLessonPackage(lessonId);
      const removed = await store.readLessonPackage(accountId, lessonId, version);
      return { phrases: installed?.manifest.lesson.phrases.length, audio: installed?.audio.map(blob => blob.size), other, retained: !!retained, removed,
        settings: await window.deviceStore.readDeviceLearningRecord(accountId) };
    }, { accountId: fixture.accountId, lessonId: fixture.lessonId, version: fixture.version });
    expect(result).toMatchObject({ phrases: 2, audio: [14, 14], other: null, retained: true, removed: null, settings: { preferredLevel: 4, settings: { speed: 2 } } });
  } finally { await fixture.cleanup(); }
});

test("a interrupted download resumes only missing bytes and detects corruption after installation", async ({ page }) => {
  const fixture = await publishPackage(page);
  const args = { accountId: fixture.accountId, lessonId: fixture.lessonId, version: fixture.version };
  let release!: () => void;
  const held = new Promise<void>(resolve => { release = resolve; });
  let firstRequests = 0;
  try {
    await page.goto("/languages");
    await loadPackageModules(page);
    await page.route(`**/api/lessons/${fixture.lessonId}/audio/1?*`, route => { firstRequests++; return route.continue(); });
    await page.route(`**/api/lessons/${fixture.lessonId}/audio/2?*`, async route => { await held; await route.fulfill({ status: 503, body: "Unavailable" }); });
    await page.evaluate(({ accountId, lessonId, version }) => {
      window.downloadManager = window.packageDownloader.createLessonPackageDownloader(accountId);
      window.packageTask = window.downloadManager.download({ id: lessonId, version }).then(() => "ready", () => "failed");
    }, args);
    await expect.poll(() => page.evaluate(async accountId => (await window.packageStore.listLessonPackages(accountId))[0]?.complete, fixture.accountId)).toBe(1);
    expect(await page.evaluate(({ accountId, lessonId, version }) => window.packageStore.readLessonPackage(accountId, lessonId, version), args)).toBeNull();
    release();
    expect(await page.evaluate(() => window.packageTask)).toBe("failed");
    await page.unroute(`**/api/lessons/${fixture.lessonId}/audio/2?*`);
    await page.evaluate(({ lessonId, version }) => window.downloadManager.download({ id: lessonId, version }), args);
    expect(firstRequests).toBe(1);
    expect(await page.evaluate(async ({ accountId, lessonId, version }) => !!await window.packageStore.readLessonPackage(accountId, lessonId, version), args)).toBe(true);
    // Fault injection at the browser storage boundary: same size, wrong digest.
    await page.evaluate(async () => {
      const db = await new Promise<IDBDatabase>((resolve, reject) => { const req = indexedDB.open("meta-shadowing-lesson-packages-v1"); req.onsuccess = () => resolve(req.result); req.onerror = () => reject(req.error); });
      await new Promise<void>((resolve, reject) => {
        const tx = db.transaction("assets", "readwrite"), store = tx.objectStore("assets"), cursor = store.openCursor();
        cursor.onsuccess = () => { const row = cursor.result; if (row) row.update({ ...row.value, blob: new Blob([new Uint8Array(14)], { type: "audio/mpeg" }) }); };
        tx.oncomplete = () => resolve(); tx.onabort = () => reject(tx.error);
      }); db.close();
    });
    expect(await page.evaluate(({ accountId, lessonId, version }) => window.packageStore.readLessonPackage(accountId, lessonId, version), args)).toBeNull();
  } finally { release(); await fixture.cleanup(); }
});

test("cross-tab deletion and account invalidation fence delayed commits", async ({ page, context }) => {
  const fixture = await publishPackage(page);
  const args = { accountId: fixture.accountId, lessonId: fixture.lessonId, version: fixture.version };
  const other = await context.newPage();
  try {
    for (const tab of [page, other]) { await tab.goto("/languages"); await loadPackageModules(tab); }
    const prepare = () => page.evaluate(async ({ accountId, lessonId, version }) => {
      const store = window.packageStore;
      const reservation = await store.reservePackageInstall(accountId, lessonId);
      const acquisition = await (await fetch(`/api/lessons/${lessonId}/package?version=${encodeURIComponent(version)}`)).json();
      window.packageTicket = await store.beginPackageInstall(reservation, acquisition);
      for (let index = 0; index < 2; index++) await store.stagePackageAudio(window.packageTicket, index, await (await fetch(`/api/lessons/${lessonId}/audio/${index + 1}?version=${encodeURIComponent(version)}`)).blob());
    }, args);
    await prepare();
    await other.evaluate(id => window.packageStore.deleteLessonPackage(id), fixture.lessonId);
    expect(await page.evaluate(() => window.packageStore.commitPackageInstall(window.packageTicket).then(() => "ready", () => "cancelled"))).toBe("cancelled");
    await prepare();
    await other.evaluate(id => window.packageStore.invalidatePackageAccount(id), fixture.accountId);
    expect(await page.evaluate(() => window.packageStore.commitPackageInstall(window.packageTicket).then(() => "ready", () => "cancelled"))).toBe("cancelled");
    expect(await page.evaluate(({ accountId, lessonId, version }) => window.packageStore.readLessonPackage(accountId, lessonId, version), args)).toBeNull();
  } finally { await other.close(); await fixture.cleanup(); }
});

test("a 560 phrase lesson acquires a bounded complete manifest", async ({ page }) => {
  test.setTimeout(120_000);
  const fixture = await publishPackage(page, false, Array.from({ length: 560 }, () => "Hello and goodbye.\n안녕하세요.").join("\n"));
  try {
    const started = Date.now();
    const response = await page.request.get(`/api/lessons/${fixture.lessonId}/package?version=${encodeURIComponent(fixture.version)}`, { timeout: 65_000 });
    expect(response.status()).toBe(200);
    const body = await response.body(), result = JSON.parse(body.toString());
    expect(result.manifest.audio).toHaveLength(560);
    expect(result.manifest.syntax).toHaveLength(560);
    expect(result.manifest.lesson.phrases).toHaveLength(560);
    console.log(`Package fixture: 560 phrases, ${body.length} bytes, ${Date.now() - started} ms acquisition`);
  } finally { await fixture.cleanup(); }
});

test("complete acquisition rejects a revoked identity despite retained valid claims", async ({ page }) => {
  const fixture = await publishPackage(page);
  try {
    expect((await page.request.get("/api/learner/local-access")).status()).toBe(200);
    const service = createClient(process.env.SUPABASE_INTEGRATION_URL!, process.env.SUPABASE_INTEGRATION_SECRET_KEY!, { auth: { persistSession: false, autoRefreshToken: false } });
    expect((await service.auth.admin.updateUserById(fixture.accountId, { app_metadata: { provider: "email", providers: ["email"] } })).error).toBeNull();
    expect((await page.request.get("/api/learner/local-access")).status()).toBe(403);
    expect((await page.request.get(`/api/lessons/${fixture.lessonId}/package?version=${encodeURIComponent(fixture.version)}`)).status()).toBe(401);
  } finally { await fixture.cleanup(); }
});

test("settings discovers a lesson, shows download progress and gates entry until ready", async ({ page }, testInfo) => {
  const fixture = await publishPackage(page);
  try {
    const errors: string[] = [];
    const consoleCounts = { warning: 0, error: 0 };
    page.on("pageerror", error => errors.push(error.message));
    page.on("console", message => { if (message.type() === "warning") consoleCounts.warning++; if (message.type() === "error") consoleCounts.error++; });
    await page.goto(`/lessons/${fixture.lessonId}/stages`);
    await expect(page).toHaveTitle("Meta Shadowing");
    await expect(page.getByRole("button", { name: "현재 스테이지 1 시작" })).toBeDisabled();
    await page.getByRole("button", { name: "설정", exact: true }).click();
    await expect(page.getByRole("heading", { name: "다운로드한 레슨" })).toBeVisible();
    const row = page.getByRole("group", { name: "Package book 다운로드" });
    await row.getByRole("button", { name: "Package book 다운로드", exact: true }).click();
    await expect(row.getByText("다운로드 완료", { exact: true })).toBeVisible();
    await page.screenshot({ path: `/tmp/ticket28-packages-${testInfo.project.name}.png` });
    await page.getByRole("button", { name: "닫기", exact: true }).click();
    await expect(page.getByRole("button", { name: "현재 스테이지 1 시작" })).toBeEnabled();
    await page.reload();
    await expect(page.getByRole("button", { name: "현재 스테이지 1 시작" })).toBeEnabled();
    await page.getByRole("button", { name: "설정", exact: true }).click();
    await row.getByRole("button", { name: "Package book 다운로드 삭제" }).click();
    await expect(row.getByText("다운로드 필요", { exact: true })).toBeVisible();
    await page.getByRole("button", { name: "닫기", exact: true }).click();
    await expect(page.getByRole("button", { name: "현재 스테이지 1 시작" })).toBeDisabled();
    expect(errors).toEqual([]);
    console.log(`Package settings smoke ${testInfo.project.name}: ${JSON.stringify(consoleCounts)}, pageerror=${errors.length}`);
    expect(consoleCounts).toEqual({ warning: 0, error: 0 });
  } finally { await fixture.cleanup(); }
});

test("required dictionary and analysis read errors never masquerade as unavailable entries", async ({ page }) => {
  const fixture = await publishPackage(page);
  const service = createClient(process.env.SUPABASE_INTEGRATION_URL!, process.env.SUPABASE_INTEGRATION_SECRET_KEY!, { auth: { persistSession: false, autoRefreshToken: false } });
  const dictionaryId = `package-error-${randomUUID()}`;
  try {
    const url = `/api/lessons/${fixture.lessonId}/package?version=${encodeURIComponent(fixture.version)}`;
    expect((await service.from("dictionary_entries").insert({ id: dictionaryId, language: "en", headword: "hello", lookup_keys: ["hello"], source_dump: "local-package-fixture", entry: { invalid: true } })).error).toBeNull();
    expect((await page.request.get(url)).status()).toBe(503);
    expect((await service.from("dictionary_entries").delete().eq("id", dictionaryId)).error).toBeNull();
    expect((await service.from("lesson_sentence_syntax").update({ status: "complete", response: { tokens: [{ invalid: true }] } }).eq("draft_id", fixture.lessonId)).error).toBeNull();
    expect((await page.request.get(url)).status()).toBe(503);
  } finally { await service.from("dictionary_entries").delete().eq("id", dictionaryId); await fixture.cleanup(); }
});

test("account B must acquire authorization before reusing A's retained bytes; A recovers offline", async ({ page, baseURL }) => {
  const fixture = await publishPackage(page);
  const args = { accountId: fixture.accountId, lessonId: fixture.lessonId, version: fixture.version };
  const url = process.env.SUPABASE_INTEGRATION_URL!, key = process.env.SUPABASE_INTEGRATION_PUBLISHABLE_KEY!;
  const options = { auth: { persistSession: false, autoRefreshToken: false } };
  const service = createClient(url, process.env.SUPABASE_INTEGRATION_SECRET_KEY!, options);
  let accountB: string | undefined;
  try {
    await page.goto("/languages"); await loadPackageModules(page);
    await page.evaluate(({ accountId, lessonId, version }) => window.packageDownloader.createLessonPackageDownloader(accountId).download({ id: lessonId, version }), args);
    const cookiesA = await page.context().cookies();
    const email = `package-b-${randomUUID()}@example.com`, password = randomUUID();
    const created = await service.auth.admin.createUser({ email, password, email_confirm: true });
    expect(created.error).toBeNull(); accountB = created.data.user!.id;
    const client = createClient(url, key, options);
    expect((await client.auth.signInWithPassword({ email, password })).error).toBeNull();
    const session = await promoteLocalSessionToGoogle(url, service, client, accountB, "learner");
    const cookieClient = createServerClient(url, key, { cookies: { getAll: () => [], setAll: async values => {
      await page.context().addCookies(values.map(value => ({ name: value.name, value: value.value, url: baseURL!, sameSite: "Lax" as const })));
    } } });
    expect((await cookieClient.auth.setSession(session)).error).toBeNull();
    await page.reload(); await loadPackageModules(page);
    expect(await page.evaluate(({ accountId, lessonId, version }) => window.packageStore.readLessonPackage(accountId, lessonId, version), { ...args, accountId: accountB })).toBeNull();
    let audioRequests = 0;
    page.on("request", request => { if (/\/api\/lessons\/.*\/audio\//.test(request.url())) audioRequests++; });
    await page.evaluate(({ accountId, lessonId, version }) => window.packageDownloader.createLessonPackageDownloader(accountId).download({ id: lessonId, version }), { ...args, accountId: accountB });
    expect(audioRequests).toBe(0);
    expect(await page.evaluate(async ({ accountId, lessonId, version }) => !!await window.packageStore.readLessonPackage(accountId, lessonId, version), { ...args, accountId: accountB })).toBe(true);
    await page.context().clearCookies(); await page.context().addCookies(cookiesA);
    await page.reload(); await loadPackageModules(page);
    await page.context().setOffline(true);
    expect(await page.evaluate(async ({ accountId, lessonId, version }) => !!await window.packageStore.readLessonPackage(accountId, lessonId, version), args)).toBe(true);
  } finally { await page.context().setOffline(false); if (accountB) await service.auth.admin.deleteUser(accountB); await fixture.cleanup(); }
});

test("quota failures and evicted audio cannot produce playable packages", async ({ page }) => {
  const fixture = await publishPackage(page);
  const args = { accountId: fixture.accountId, lessonId: fixture.lessonId, version: fixture.version };
  try {
    await page.goto("/languages"); await loadPackageModules(page);
    const rejected = await page.evaluate(async ({ accountId, lessonId, version }) => {
      const original = IDBObjectStore.prototype.put;
      IDBObjectStore.prototype.put = function(...args: Parameters<IDBObjectStore["put"]>) {
        if (this.transaction.db.name === "meta-shadowing-lesson-packages-v1" && this.name === "assets") throw new DOMException("Denied", "QuotaExceededError");
        return original.apply(this, args);
      };
      try {
        return await window.packageDownloader.createLessonPackageDownloader(accountId).download({ id: lessonId, version }).then(() => false, () => true);
      } finally { IDBObjectStore.prototype.put = original; }
    }, args);
    expect(rejected).toBe(true);
    expect(await page.evaluate(({ accountId, lessonId, version }) => window.packageStore.readLessonPackage(accountId, lessonId, version), args)).toBeNull();
    await page.evaluate(({ accountId, lessonId, version }) => window.packageDownloader.createLessonPackageDownloader(accountId).download({ id: lessonId, version }), args);
    await page.evaluate(() => new Promise<void>((resolve, reject) => {
      const request = indexedDB.open("meta-shadowing-lesson-packages-v1");
      request.onerror = () => reject(request.error);
      request.onsuccess = () => {
        const transaction = request.result.transaction("assets", "readwrite"); transaction.objectStore("assets").clear();
        transaction.oncomplete = () => { request.result.close(); resolve(); }; transaction.onabort = () => reject(transaction.error);
      };
    }));
    expect(await page.evaluate(({ accountId, lessonId, version }) => window.packageStore.readLessonPackage(accountId, lessonId, version), args)).toBeNull();
  } finally { await fixture.cleanup(); }
});

test("package storage audit permits only the exact open name, not lookalikes or database deletion", async ({ page, context }) => {
  const accesses = await auditLearningStorage(context);
  await page.request.post("/api/auth", { data: { password: "integration-beta-password" } });
  await page.goto("/languages");
  await page.evaluate(async () => {
    for (const name of ["meta-shadowing-lesson-packages-v1", "meta-shadowing-lesson-packages-v1-extra"]) await new Promise<void>((resolve, reject) => {
      const request = indexedDB.open(name); request.onsuccess = () => { request.result.close(); resolve(); }; request.onerror = () => reject(request.error);
    });
    indexedDB.deleteDatabase("meta-shadowing-lesson-packages-v1");
  });
  await expect.poll(() => accesses).toEqual(["IndexedDB.open:meta-shadowing-lesson-packages-v1-extra", "IndexedDB.deleteDatabase:meta-shadowing-lesson-packages-v1"]);
});

test("the visible download controls pause and resume verified partial audio", async ({ page }) => {
  const fixture = await publishPackage(page);
  let release!: () => void;
  const held = new Promise<void>(resolve => { release = resolve; });
  try {
    await page.route(`**/api/lessons/${fixture.lessonId}/audio/2?*`, async route => { await held; await route.continue().catch(() => {}); });
    await page.goto(`/lessons/${fixture.lessonId}/stages`);
    await page.getByRole("button", { name: "설정", exact: true }).click();
    const row = page.getByRole("group", { name: "Package book 다운로드" });
    await row.getByRole("button", { name: "Package book 다운로드", exact: true }).click();
    await expect(row.getByText("1 / 2 오디오 저장 중…", { exact: true })).toBeVisible();
    await row.getByRole("button", { name: "Package book 다운로드 일시 정지" }).click();
    await expect(row.getByText("다운로드 일시 정지", { exact: true })).toBeVisible();
    release(); await page.unroute(`**/api/lessons/${fixture.lessonId}/audio/2?*`);
    await row.getByRole("button", { name: "Package book 이어받기", exact: true }).click();
    await expect(row.getByText("다운로드 완료", { exact: true })).toBeVisible();
  } finally { release(); await fixture.cleanup(); }
});

test("blocked package storage fails closed without creating a media player", async ({ page }) => {
  const fixture = await publishPackage(page, true);
  try {
    await page.addInitScript(() => {
      const original = IDBFactory.prototype.open;
      IDBFactory.prototype.open = function (name, version) {
        if (name === "meta-shadowing-lesson-packages-v1") throw new DOMException("Package storage blocked", "SecurityError");
        return original.call(this, name, version);
      };
    });
    await page.goto(`/player?lesson=${fixture.lessonId}&level=1&stage=1`);
    const failure = page.getByRole("alertdialog", { name: "다운로드 저장 공간을 확인하지 못했습니다.", exact: true });
    await expect(failure).toBeVisible();
    await expect(failure.getByRole("button", { name: "다운로드 다시 확인", exact: true })).toBeEnabled();
    await expect(page.locator("audio")).toHaveCount(0);
    // Dismissing an explanation must not remove the storage gate.
    await failure.getByRole("button", { name: "닫기", exact: true }).click();
    await expect(page.getByRole("button", { name: "Package book 다운로드", exact: true })).toBeDisabled();
    await expect(page.locator("audio")).toHaveCount(0);
  } finally { await fixture.cleanup(); }
});

test("manifest tokenization includes hint, rapid token and cumulative text lookup variants", async ({ page }) => {
  const fixture = await publishPackage(page, false, "Hello and goodbye.\n안녕하세요.");
  try {
    const response = await page.request.get(`/api/lessons/${fixture.lessonId}/package?version=${encodeURIComponent(fixture.version)}`);
    expect(response.status()).toBe(200);
    const { manifest } = await response.json();
    for (const text of ["Hello and goodbye.", "Hello", "and", "goodbye.", "Hello and"]) {
      expect(manifest.words[text], text).toBeDefined();
      for (const word of manifest.words[text]) if (word.isWordLike) expect(manifest.dictionary[word.segment.toLowerCase()]).toBeDefined();
    }
  } finally { await fixture.cleanup(); }
});

test("an incomplete replacement leaves the previous complete version intact", async ({ page }) => {
  const fixture = await publishPackage(page);
  try {
    await page.goto("/languages"); await loadPackageModules(page);
    const result = await page.evaluate(async ({ accountId, lessonId, version }) => {
      const store = window.packageStore;
      await window.packageDownloader.createLessonPackageDownloader(accountId).download({ id: lessonId, version });
      const original = await store.readLessonPackage(accountId, lessonId, version);
      const acquisition = await (await fetch(`/api/lessons/${lessonId}/package?version=${encodeURIComponent(version)}`)).json();
      const replacementVersion = new Date(Date.parse(version) + 1000).toISOString();
      acquisition.manifest.lesson.version = replacementVersion;
      acquisition.manifest.lesson.name = "Replacement";
      acquisition.sha256 = Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(JSON.stringify(acquisition.manifest)))), value => value.toString(16).padStart(2, "0")).join("");
      const ticket = await store.beginPackageInstall(await store.reservePackageInstall(accountId, lessonId), acquisition);
      await store.stagePackageAudio(ticket, 0, original!.audio[0]);
      const incomplete = await store.commitPackageInstall(ticket).then(() => "ready", () => "incomplete");
      const prior = !!await store.readLessonPackage(accountId, lessonId, version);
      const staged = await store.readLessonPackage(accountId, lessonId, replacementVersion);
      await store.stagePackageAudio(ticket, 1, original!.audio[1]); await store.commitPackageInstall(ticket);
      return { incomplete, prior, staged, name: (await store.readLessonPackage(accountId, lessonId, replacementVersion))?.manifest.lesson.name,
        retained: !!await store.readLessonPackage(accountId, lessonId, version) };
    }, { accountId: fixture.accountId, lessonId: fixture.lessonId, version: fixture.version });
    expect(result).toEqual({ incomplete: "incomplete", prior: true, staged: null, name: "Replacement", retained: true });
  } finally { await fixture.cleanup(); }
});
