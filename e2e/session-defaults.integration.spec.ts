import { openSelectedStageSettings } from "./fixtures/stage-preview";
import { randomUUID } from "node:crypto";
import { expect, test } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";

test.skip(process.env.ADMIN_SUPABASE_INTEGRATION !== "1", "requires the project-local Supabase stack");

test("admin defaults persist behind authorization and reach learners without overwriting browser overrides", async ({ page }) => {
  const service = createClient(process.env.SUPABASE_INTEGRATION_URL!, process.env.SUPABASE_INTEGRATION_SECRET_KEY!, { auth: { persistSession: false, autoRefreshToken: false } });
  const original = await service.from("session_defaults").select("settings").eq("id", true).single();
  const email = `settings-${randomUUID()}@example.com`;
  const created = await service.auth.admin.createUser({ email, email_confirm: true, app_metadata: { role: "admin" } });
  expect(created.error).toBeNull();
  try {
    expect((await page.request.put("/api/admin/settings", { data: {} })).status()).toBe(401);
    const link = await service.auth.admin.generateLink({ type: "magiclink", email });
    expect(link.error).toBeNull();
    expect((await page.request.post("/api/admin/auth/verify", { data: { email, token: link.data.properties?.email_otp } })).status()).toBe(200);
    await page.goto("/admin");
    await page.getByRole("link", { name: "전역 학습 기본값" }).click();
    await page.getByRole("group", { name: "원음 기본값", exact: true }).getByLabel("재생속도").selectOption("2");
    await page.getByLabel("기본 묶음 크기").selectOption("3");
    await page.getByRole("group", { name: "속사포 기본값", exact: true }).getByLabel("단어 속도").selectOption("5");
    const saving = page.waitForResponse(response => response.url().endsWith("/api/admin/settings") && response.request().method() === "PUT");
    await page.getByRole("button", { name: "기본값 저장", exact: true }).click();
    const response = await saving;
    expect(response.status()).toBe(200);
    await expect(page.getByRole("status")).toHaveText("전역 기본값을 저장했습니다.");
    await page.reload();
    await expect(page.getByRole("group", { name: "원음 기본값", exact: true }).getByLabel("재생속도")).toHaveValue("2");
    const saved = await service.from("session_defaults").select("settings").eq("id", true).single();
    expect(saved.data?.settings).toMatchObject({ speed: 2, groupSize: 3, wpmLevel: 5 });
    const invalid = await page.request.put("/api/admin/settings", { data: { ...saved.data?.settings, speed: 99 } });
    expect(invalid.status()).toBe(400);
    const crossOrigin = await page.request.put("/api/admin/settings", { headers: { Origin: "https://example.invalid" }, data: saved.data?.settings });
    expect(crossOrigin.status()).toBe(403);

    const draft = await page.request.post("/api/admin/drafts", { multipart: {
      title: "Defaults integration lesson", language: "english",
      scriptFile: { name: "script.txt", mimeType: "text/plain", buffer: Buffer.from("Hello.\n안녕.") }
    } });
    expect(draft.status()).toBe(201);
    const { draftId } = await draft.json();
    // Catalog fixture only; private-audio publication is exercised by its own real integration test.
    const publication = await service.from("lesson_drafts").update({ publication_status: "published", published_at: "2026-09-06T00:00:00Z", audio_manifest: [{}] }).eq("id", draftId);
    expect(publication.error).toBeNull();
    await page.request.post("/api/auth", { data: { password: "integration-beta-password" } });
    await page.goto(`/setup?lesson=${draftId}`);
    await openSelectedStageSettings(page);
    await expect(page.getByLabel("재생속도")).toHaveValue("2");
    await page.getByLabel("재생속도").selectOption("3");
    await page.keyboard.press("Escape");
    await page.getByRole("radio", { name: /7 다문장 암기/ }).click();
    await openSelectedStageSettings(page);
    await expect(page.getByLabel("묶음 크기")).toHaveValue("3");
    await page.keyboard.press("Escape");
    await page.getByRole("radio", { name: /11 속사포 영한/ }).click();
    await openSelectedStageSettings(page);
    await expect(page.getByLabel("단어 속도")).toHaveValue("5");
    expect((await page.request.put("/api/admin/settings", { data: { ...saved.data?.settings, speed: 1.5, wpmLevel: 6 } })).status()).toBe(200);
    await page.goto(`/setup?lesson=${draftId}`);
    await openSelectedStageSettings(page);
    await expect(page.getByLabel("재생속도")).toHaveValue("3");
    await page.keyboard.press("Escape");
    await page.getByRole("radio", { name: /11 속사포 영한/ }).click();
    await openSelectedStageSettings(page);
    await expect(page.getByLabel("단어 속도")).toHaveValue("6");
  } finally {
    if (original.data) await service.from("session_defaults").update({ settings: original.data.settings }).eq("id", true);
    if (created.data.user) await service.auth.admin.deleteUser(created.data.user.id);
  }
});
