import { randomUUID } from "node:crypto";
import { expect, test } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import {
  assertLocalSupabaseUrl,
  installLocalSupabaseSession,
  promoteLocalSessionToGoogle
} from "./fixtures/local-supabase-google";

test.skip(process.env.ADMIN_SUPABASE_INTEGRATION !== "1", "requires the project-local Supabase stack");

test("admin defaults persist behind authorization without replacing device-local learner settings", async ({ page }) => {
  const url = process.env.SUPABASE_INTEGRATION_URL!;
  assertLocalSupabaseUrl(url);
  const options = { auth: { persistSession: false, autoRefreshToken: false } };
  const service = createClient(url, process.env.SUPABASE_INTEGRATION_SECRET_KEY!, options);
  const authenticatedAdmin = createClient(url, process.env.SUPABASE_INTEGRATION_PUBLISHABLE_KEY!, options);
  const original = await service.from("session_defaults").select("settings").eq("id", true).single();
  const email = `settings-${randomUUID()}@example.com`;
  const created = await service.auth.admin.createUser({ email, email_confirm: true, app_metadata: { role: "admin" } });
  expect(created.error).toBeNull();
  try {
    expect((await page.request.put("/api/admin/settings", { data: {} })).status()).toBe(401);
    const link = await service.auth.admin.generateLink({ type: "magiclink", email });
    expect(link.error).toBeNull();
    expect((await page.request.post("/api/admin/auth/verify", { data: { email, token: link.data.properties?.email_otp } })).status()).toBe(200);
    const clientLink = await service.auth.admin.generateLink({ type: "magiclink", email });
    expect(clientLink.error).toBeNull();
    const clientOtp = clientLink.data.properties?.email_otp;
    if (!clientOtp || !created.data.user) throw new Error("Local Supabase did not create the admin OTP fixture.");
    expect((await authenticatedAdmin.auth.verifyOtp({ email, token: clientOtp, type: "email" })).error).toBeNull();
    const googleAdminSession = await promoteLocalSessionToGoogle(
      url, service, authenticatedAdmin, created.data.user.id, "admin"
    );
    await installLocalSupabaseSession(page, url, googleAdminSession);
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

    // Settings are available without acquiring a lesson. A new device starts
    // from app defaults, not the legacy server account's merged preferences.
    let preferenceWrites = 0;
    page.on("request", request => {
      if (new URL(request.url()).pathname === "/api/learner/preferences" && request.method() === "PATCH") preferenceWrites++;
    });
    expect((await page.request.post("/api/auth", { data: { password: "integration-beta-password" } })).status()).toBe(200);
    expect((await page.request.get("/api/learner/preferences")).status()).toBe(200);
    await page.goto("/languages");
    await page.getByRole("button", { name: "설정", exact: true }).click();
    await expect(page.getByLabel("재생속도")).toHaveValue("1");
    await page.getByLabel("재생속도").selectOption("3");
    await expect(page.getByLabel("재생속도")).toBeEnabled();
    await page.getByLabel("학습 레벨").selectOption("4");
    await expect(page.getByLabel("학습 레벨")).toBeEnabled();
    await expect(page.getByLabel("묶음 크기")).toHaveValue("2");
    await page.getByLabel("묶음 크기").selectOption("3");
    await expect(page.getByLabel("묶음 크기")).toBeEnabled();
    await page.getByLabel("학습 레벨").selectOption("6");
    await expect(page.getByLabel("학습 레벨")).toBeEnabled();
    await page.getByLabel("단어 속도").selectOption("5");
    await expect(page.getByLabel("단어 속도")).toBeEnabled();
    expect((await page.request.put("/api/admin/settings", { data: { ...saved.data?.settings, speed: 1.5, wpmLevel: 6 } })).status()).toBe(200);
    await page.reload();
    await page.getByRole("button", { name: "설정", exact: true }).click();
    await expect(page.getByLabel("학습 레벨")).toHaveValue("6");
    await expect(page.getByLabel("단어 속도")).toHaveValue("5");
    await page.getByLabel("학습 레벨").selectOption("4");
    await expect(page.getByLabel("학습 레벨")).toBeEnabled();
    await expect(page.getByLabel("재생속도")).toHaveValue("3");
    await expect(page.getByLabel("묶음 크기")).toHaveValue("3");
    expect(preferenceWrites).toBe(0);
  } finally {
    if (original.data) await service.from("session_defaults").update({ settings: original.data.settings }).eq("id", true);
    if (created.data.user) await service.auth.admin.deleteUser(created.data.user.id);
  }
});
