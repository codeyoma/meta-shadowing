import { openLearnerPage, enterAccountPractice, advanceCloudClock, pauseCloudClock } from "./fixtures/cloud-navigation";
import { randomUUID } from "node:crypto";
import { execFileSync } from "node:child_process";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, test, type Page } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import { testRecording } from "./fixtures/audio";
import {
  assertLocalSupabaseUrl,
  installLocalSupabaseSession,
  promoteLocalSessionToGoogle
} from "./fixtures/local-supabase-google";

test.skip(process.env.ADMIN_SUPABASE_INTEGRATION !== "1", "requires the project-local Supabase stack");

async function lifecycleFixture(page: Page) {
  const url = process.env.SUPABASE_INTEGRATION_URL!;
  assertLocalSupabaseUrl(url);
  const options = { auth: { persistSession: false, autoRefreshToken: false } };
  const service = createClient(url, process.env.SUPABASE_INTEGRATION_SECRET_KEY!, options);
  const admin = createClient(url, process.env.SUPABASE_INTEGRATION_PUBLISHABLE_KEY!, options);
  const email = `lifecycle-${randomUUID()}@example.com`;
  const { data, error } = await service.auth.admin.createUser({ email, email_confirm: true, app_metadata: { role: "admin" } });
  expect(error).toBeNull();
  const owner = data.user!.id;
  const paths: string[] = [];
  async function otp() {
    const { data, error } = await service.auth.admin.generateLink({ type: "magiclink", email });
    expect(error).toBeNull();
    if (!data.properties) throw new Error("OTP was not generated");
    return data.properties.email_otp;
  }
  expect((await page.request.post("/api/admin/auth/verify", { data: { email, token: await otp() } })).status()).toBe(200);
  expect((await admin.auth.verifyOtp({ email, token: await otp(), type: "email" })).error).toBeNull();
  const googleAdminSession = await promoteLocalSessionToGoogle(url, service, admin, owner, "admin");
  await installLocalSupabaseSession(page, url, googleAdminSession);
  expect((await page.request.post("/api/auth", { data: { password: "integration-beta-password" } })).status()).toBe(200);

  async function draft(title: string, replacementFor?: string) {
    const response = await page.request.post("/api/admin/drafts", { multipart: {
      title, language: "english", ...(replacementFor ? { replacementFor } : {}),
      scriptFile: { name: "script.txt", mimeType: "text/plain", buffer: Buffer.from("Hello there.\n안녕하세요.\nGood morning.\n좋은 아침입니다.") }
    } });
    expect(response.status()).toBe(201);
    return (await response.json()).draftId as string;
  }
  async function upload(id: string) {
    for (const name of ["001.webm", "002.webm"]) {
      const path = `${owner}/${id}/${name}`;
      paths.push(path);
      expect((await admin.storage.from("lesson-audio").upload(path, testRecording, { contentType: "audio/webm" })).error).toBeNull();
    }
  }
  async function publish(id: string) {
    const response = await page.request.post(`/api/admin/drafts/${id}/publish`);
    expect(response.status()).toBe(200);
    return response.json();
  }
  async function cleanup() {
    if (paths.length) expect((await service.storage.from("lesson-audio").remove(paths)).error).toBeNull();
    expect((await service.from("lesson_drafts").delete().eq("created_by", owner)).error).toBeNull();
    expect((await service.auth.admin.deleteUser(owner)).error).toBeNull();
  }
  return { service, admin, owner, paths, draft, upload, publish, cleanup };
}

async function expectPreservedCompletion(page: Page, originalVersion: string) {
  await page.getByRole("button", { name: "이 레슨의 완료 기록", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "완료 기록", exact: true });
  const table = dialog.getByRole("table", { name: "이 레슨의 완료 기록", exact: true });
  const records = table.getByRole("row").filter({ has: page.getByRole("button", { name: "설정 보기", exact: true }) });
  await expect(records).toHaveCount(1);
  await expect(records.getByRole("rowheader")).toContainText("스테이지 11");
  await expect(records.getByRole("rowheader")).toContainText("레벨 6");
  await records.getByRole("button", { name: "설정 보기", exact: true }).click();
  await expect(dialog.getByText(`버전 ${originalVersion}`, { exact: true })).toBeVisible();
  await dialog.getByRole("button", { name: "완료 기록 닫기", exact: true }).click();
  await expect(dialog).toHaveCount(0);
}

test("a validated replacement keeps the lesson ID and atomically advances its version", async ({ page }) => {
  const fixture = await lifecycleFixture(page);
  try {
    const original = await fixture.draft("Original lesson");
    await fixture.upload(original);
    await fixture.publish(original);
    const { data: before } = await fixture.service.from("lesson_drafts").select("published_at").eq("id", original).single();
    const replacement = await fixture.draft("Replacement lesson", original);
    await page.goto("/lessons?language=english");
    await expect(page.getByRole("link", { name: /Original lesson/ })).toBeVisible();
    await expect(page.getByText("Replacement lesson", { exact: true })).toHaveCount(0);
    expect((await page.request.post(`/api/admin/drafts/${replacement}/publish`)).status()).toBe(422);
    await fixture.upload(replacement);
    const publication = await fixture.publish(replacement);
    expect(publication.lessonId).toBe(original);
    const { data: versions, error } = await fixture.service.from("lesson_drafts").select("id, publication_status, published_at").eq("lesson_id", original);
    expect(error).toBeNull();
    expect(versions).toHaveLength(2);
    expect(versions!.find(version => version.id === original)?.publication_status).toBe("archived");
    expect(versions!.find(version => version.id === replacement)?.published_at).not.toBe(before!.published_at);
    await page.reload();
    await expect(page.getByRole("link", { name: /Replacement lesson/ })).toBeVisible();
    await expect(page.getByText("Original lesson", { exact: true })).toHaveCount(0);
    expect((await page.request.get(`/api/lessons/${original}/audio/1?version=${encodeURIComponent(before!.published_at)}`, { maxRedirects: 0 })).status()).toBe(404);
    expect((await page.request.get(`/api/lessons/${original}/audio/1`, { maxRedirects: 0 })).status()).toBe(307);
  } finally { await fixture.cleanup(); }
});

for (const entry of ["home", "player"] as const) {
  test(`a new lesson version resets ${entry} resume but preserves completed history`, async ({ page }) => {
    const fixture = await lifecycleFixture(page);
    try {
      const original = await fixture.draft("Versioned practice");
      await fixture.upload(original);
      await fixture.publish(original);
      const { data: published, error } = await fixture.service.from("lesson_drafts").select("published_at").eq("id", original).single();
      expect(error).toBeNull();
      const originalVersion = published!.published_at as string;
      await page.clock.install({ time: new Date("2026-09-06T00:00:00Z") });
      await openLearnerPage(page, `/player?lesson=${original}&level=6&mode=automatic&lineGap=0`);
      await page.waitForLoadState("networkidle");
      await pauseCloudClock(page, new Date("2026-09-06T00:01:00Z"));
      await page.getByRole("button", { name: "CONTINUE · 문장 시작", exact: true }).click();
      // Include timer-tick boundaries around real checkpoint acknowledgments.
      // This scenario checks version/history behavior, not exact word timing.
      await advanceCloudClock(page, 3000);
      await expect(page.getByRole("heading", { name: "레벨 6 학습 완료" })).toBeVisible();
      await openLearnerPage(page, `/player?lesson=${original}&level=6&mode=manual`);
      await page.waitForLoadState("networkidle");
      await page.getByRole("button", { name: "CONTINUE · 문장 시작", exact: true }).click();
      await advanceCloudClock(page, 1500);
      await page.keyboard.press("Space");
      await expect(page.getByText("문장 2 / 2", { exact: true })).toBeVisible();
      const oldRun = page.url();
      const replacement = await fixture.draft("Updated practice", original);
      await fixture.upload(replacement);
      await fixture.publish(replacement);
      await page.goto(entry === "home" ? "/lessons?language=english" : oldRun);
      if (entry === "home") {
        await page.getByRole("link", { name: /Updated practice/ }).click();
        await expectPreservedCompletion(page, originalVersion);
        await page.getByRole("button", { name: "현재 스테이지 1 시작", exact: true }).click();
      } else await expect(page.getByText(/레슨 버전이 변경되어 이전 진도를 이어갈 수 없습니다/)).toBeVisible();
      await enterAccountPractice(page);
      const firstUnit = page.getByRole("navigation", { name: "학습 탐색", exact: true })
        .getByText(entry === "home" ? "1 / 2" : "문장 1 / 2", { exact: true });
      await expect(firstUnit).toBeVisible();
      expect(new URL(page.url()).searchParams.get("run")).not.toBe(new URL(oldRun).searchParams.get("run"));
      await page.reload();
      await enterAccountPractice(page);
      await expect(firstUnit).toBeVisible();
      await page.goto("/lessons?language=english");
      await page.getByRole("link", { name: /Updated practice/ }).click();
      await expectPreservedCompletion(page, originalVersion);
    } finally { await fixture.cleanup(); }
  });
}

for (const viewport of [{ name: "desktop", width: 1280, height: 900 }, { name: "mobile", width: 390, height: 844 }]) {
test(`an administrator replaces from files, unpublishes without loss, and confirms permanent cleanup (${viewport.name})`, async ({ page, request }) => {
  await page.setViewportSize(viewport);
  const consoleProblems: string[] = [];
  page.on("pageerror", error => consoleProblems.push(error.message));
  page.on("console", message => { if (["warning", "error"].includes(message.type())) consoleProblems.push(message.text()); });
  const fixture = await lifecycleFixture(page);
  try {
    const original = await fixture.draft("Managed lesson");
    await fixture.upload(original);
    await fixture.publish(original);
    expect((await request.get("/api/admin/lessons")).status()).toBe(401);
    expect((await request.post(`/api/admin/lessons/${original}/unpublish`)).status()).toBe(401);
    expect((await request.delete(`/api/admin/lessons/${original}`)).status()).toBe(401);
    await page.goto("/admin/lessons");
    await expect(page).toHaveTitle(/Meta Shadowing/);
    expect(new URL(page.url()).pathname).toBe("/admin/lessons");
    await expect(page.getByRole("heading", { name: "레슨 관리", exact: true })).toBeVisible();
    const row = page.getByRole("listitem").filter({ has: page.getByRole("heading", { name: "Managed lesson", exact: true }) });
    await row.getByRole("link", { name: "새 버전 가져오기" }).click();
    await expect(page.getByRole("heading", { name: "레슨 새 버전 가져오기" })).toBeVisible();
    await page.getByLabel("레슨 제목").fill("Managed replacement");
    await page.getByLabel("통합 스크립트", { exact: true }).setInputFiles({ name: "script.txt", mimeType: "text/plain", buffer: Buffer.from("Welcome home.\n어서 오세요.") });
    await page.getByLabel("문장별 음성 파일").setInputFiles({ name: "001.webm", mimeType: "audio/webm", buffer: testRecording });
    await page.getByRole("button", { name: "파일 검증", exact: true }).click();
    const saved = page.waitForResponse(response => response.url().endsWith("/api/admin/drafts") && response.request().method() === "POST");
    await page.getByRole("button", { name: "초안 저장", exact: true }).click();
    const replacementId = (await (await saved).json()).draftId as string;
    fixture.paths.push(`${fixture.owner}/${replacementId}/001.webm`);
    await page.getByRole("button", { name: "음성 업로드 후 게시", exact: true }).click();
    await expect(page.getByRole("status")).toHaveText("레슨이 게시되었습니다.");
    await page.getByRole("link", { name: "레슨 관리", exact: true }).click();
    const replaced = page.getByRole("listitem").filter({ has: page.getByRole("heading", { name: "Managed replacement", exact: true }) });
    await expect(replaced).toContainText("2개 버전");
    await page.screenshot({ path: join(tmpdir(), `meta-shadowing-issue10-${viewport.name}-management.png`) });
    await replaced.getByRole("button", { name: "게시 해제", exact: true }).click();
    await expect(replaced).toContainText("게시 해제됨");
    await page.goto("/lessons?language=english");
    await expect(page.getByRole("link", { name: /Managed replacement/ })).toHaveCount(0);
    const { data: retained, error } = await fixture.service.from("lesson_drafts").select("id").eq("lesson_id", original);
    expect(error).toBeNull();
    expect(retained).toHaveLength(2);
    expect((await fixture.service.storage.from("lesson-audio").download(fixture.paths[0])).error).toBeNull();
    await page.goto("/admin/lessons");
    await replaced.getByRole("button", { name: "영구 삭제", exact: true }).click();
    const confirmation = page.getByRole("group", { name: "영구 삭제 확인" });
    await expect(confirmation).toContainText("복구할 수 없습니다");
    await expect(confirmation.getByRole("button", { name: "삭제 확인", exact: true })).toBeDisabled();
    expect((await page.request.delete(`/api/admin/lessons/${original}`, { data: { confirmTitle: "wrong", expectedDraftId: replacementId } })).status()).toBe(409);
    await confirmation.getByLabel("삭제할 레슨 제목").fill("Managed replacement");
    await confirmation.scrollIntoViewIfNeeded();
    await page.screenshot({ path: join(tmpdir(), `meta-shadowing-issue10-${viewport.name}-confirmation.png`) });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    await confirmation.getByRole("button", { name: "삭제 확인", exact: true }).click();
    await expect(replaced).toHaveCount(0);
    const { data: remaining } = await fixture.service.from("lesson_drafts").select("id").eq("lesson_id", original);
    expect(remaining).toEqual([]);
    for (const id of [original, replacementId]) {
      const { data, error } = await fixture.service.storage.from("lesson-audio").list(`${fixture.owner}/${id}`);
      expect(error).toBeNull();
      expect(data).toEqual([]);
    }
    expect(consoleProblems).toEqual([]);
  } finally { await fixture.cleanup(); }
});
}

test("partial Storage deletion remains hidden and can be retried after a reload", async ({ page }) => {
  const fixture = await lifecycleFixture(page);
  const fault = `test_cleanup_${randomUUID().replaceAll("-", "")}`;
  const query = (sql: string) => execFileSync("npx", ["--yes", "supabase@2.116.0", "db", "query", "--local",
    ...(process.env.SUPABASE_TEST_WORKDIR ? ["--workdir", process.env.SUPABASE_TEST_WORKDIR] : []), sql], { stdio: "pipe" });
  let faultInstalled = false;
  try {
    const original = await fixture.draft("Cleanup original");
    await fixture.upload(original);
    await fixture.publish(original);
    const replacement = await fixture.draft("Cleanup replacement", original);
    await fixture.upload(replacement);
    await fixture.publish(replacement);
    // External fault at the real Storage/database boundary, not a mocked repository.
    query(`do $apply$ begin execute $ddl$
      create function private.${fault}() returns trigger language plpgsql set search_path = '' as $fn$
      begin raise exception 'issue 10 test Storage failure'; end; $fn$;
      create trigger ${fault} before delete on storage.objects for each row
      when (old.name = '${fixture.owner}/${replacement}/001.webm') execute function private.${fault}();
      $ddl$; end $apply$`);
    faultInstalled = true;
    await page.goto("/admin/lessons");
    await page.getByRole("button", { name: "영구 삭제", exact: true }).click();
    await page.getByLabel("삭제할 레슨 제목").fill("Cleanup replacement");
    await page.getByRole("button", { name: "삭제 확인", exact: true }).click();
    await expect(page.getByRole("button", { name: "삭제 정리 다시 시도", exact: true })).toBeVisible();
    const { data: root } = await fixture.service.from("lesson_drafts").select("deletion_started_at, cleanup_error").eq("id", original).single();
    expect(root!.deletion_started_at).toBeTruthy();
    expect(root!.cleanup_error).toContain("삭제가 완료되지 않았습니다");
    expect((await fixture.service.storage.from("lesson-audio").list(`${fixture.owner}/${original}`)).data).toEqual([]);
    expect((await fixture.service.storage.from("lesson-audio").list(`${fixture.owner}/${replacement}`)).data).toHaveLength(2);
    await page.goto("/lessons?language=english");
    await expect(page.getByRole("link", { name: /Cleanup/ })).toHaveCount(0);
    expect((await page.request.get(`/api/lessons/${original}/audio/1`, { maxRedirects: 0 })).status()).toBe(404);
    await page.goto("/admin/lessons");
    await expect(page.getByText("삭제 정리 필요", { exact: false })).toBeVisible();
    query(`do $apply$ begin execute 'drop trigger ${fault} on storage.objects'; execute 'drop function private.${fault}()'; end $apply$`);
    faultInstalled = false;
    await page.getByRole("button", { name: "삭제 정리 다시 시도", exact: true }).click();
    await page.getByLabel("삭제할 레슨 제목").fill("Cleanup replacement");
    await page.getByRole("button", { name: "삭제 확인", exact: true }).click();
    await expect(page.getByText("저장된 레슨이 없습니다.", { exact: true })).toBeVisible();
    expect((await fixture.service.from("lesson_drafts").select("id").eq("lesson_id", original)).data).toEqual([]);
    expect((await fixture.service.storage.from("lesson-audio").list(`${fixture.owner}/${replacement}`)).data).toEqual([]);
  } finally {
    if (faultInstalled) query(`do $apply$ begin execute 'drop trigger ${fault} on storage.objects'; execute 'drop function private.${fault}()'; end $apply$`);
    await fixture.cleanup();
  }
});

test("another administrator cannot replace, unpublish or delete an owned lesson or mutate published bytes", async ({ page, browser }) => {
  const fixture = await lifecycleFixture(page);
  const otherPage = await browser.newPage();
  const other = await lifecycleFixture(otherPage);
  try {
    const original = await fixture.draft("Owner protected lesson");
    await fixture.upload(original);
    await fixture.publish(original);
    expect((await page.request.post(`/api/admin/lessons/${original}/unpublish`, { headers: { origin: "https://untrusted.example" } })).status()).toBe(403);
    expect((await page.request.delete(`/api/admin/lessons/${original}`, { headers: { origin: "https://untrusted.example" },
      data: { confirmTitle: "Owner protected lesson", expectedDraftId: original } })).status()).toBe(403);
    expect((await page.request.delete(`/api/admin/lessons/${original}`, { headers: { "content-type": "application/json" }, data: "not-json" })).status()).toBe(400);
    expect((await page.request.delete(`/api/admin/lessons/${original}`, { headers: { "content-type": "text/plain" }, data: "{}" })).status()).toBe(415);
    expect((await otherPage.request.post(`/api/admin/lessons/${original}/unpublish`)).status()).toBe(404);
    expect((await otherPage.request.delete(`/api/admin/lessons/${original}`, {
      data: { confirmTitle: "Owner protected lesson", expectedDraftId: original }
    })).status()).toBe(404);
    const replacement = await otherPage.request.post("/api/admin/drafts", { multipart: {
      title: "Unauthorized replacement", language: "english", replacementFor: original,
      scriptFile: { name: "script.txt", mimeType: "text/plain", buffer: Buffer.from("Hello.\n안녕.") }
    } });
    expect(replacement.status()).toBe(404);
    expect((await otherPage.request.get("/api/admin/lessons")).status()).toBe(200);
    expect((await (await otherPage.request.get("/api/admin/lessons")).json()).lessons).toEqual([]);
    expect((await fixture.admin.rpc("unpublish_lesson", { p_lesson_id: original, p_admin_id: fixture.owner })).error?.code).toBe("42501");
    expect((await fixture.admin.from("lesson_drafts").update({ title: "Bypassed version" }).eq("id", original)).error?.code).toBe("42501");
    expect((await fixture.admin.storage.from("lesson-audio").upload(fixture.paths[0], testRecording, { contentType: "audio/webm", upsert: true })).error).not.toBeNull();
    expect((await fixture.admin.from("lesson_drafts").delete().eq("id", original)).error?.code).toBe("42501");
    expect((await fixture.service.from("lesson_drafts").select("publication_status").eq("id", original).single()).data?.publication_status).toBe("published");
    expect((await fixture.service.storage.from("lesson-audio").download(fixture.paths[0])).error).toBeNull();
  } finally { await other.cleanup(); await otherPage.close(); await fixture.cleanup(); }
});
