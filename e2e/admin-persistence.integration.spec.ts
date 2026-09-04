import { randomUUID } from "node:crypto";
import { expect, test } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";

const integrationEnabled = process.env.ADMIN_SUPABASE_INTEGRATION === "1";

test.skip(!integrationEnabled, "requires the project-local Supabase stack");

test("the administrator draft route persists the parsed import behind RLS", async ({ page }) => {
  const supabaseUrl = process.env.SUPABASE_INTEGRATION_URL!;
  const publishableKey = process.env.SUPABASE_INTEGRATION_PUBLISHABLE_KEY!;
  const secretKey = process.env.SUPABASE_INTEGRATION_SECRET_KEY!;
  const email = `admin-integration-${randomUUID()}@example.com`;
  const title = "통합 테스트 아침 일과";
  const targetSource = "## Morning Routine\nGood morning.\n\nI wash my face.\n";
  const koreanSource = "## 아침 일과\n좋은 아침입니다.\n\n세수합니다.\n";

  const serviceClient = createClient(supabaseUrl, secretKey, {
    auth: { autoRefreshToken: false, persistSession: false }
  });
  const { data: created, error: createError } = await serviceClient.auth.admin.createUser({
    email,
    email_confirm: true,
    app_metadata: { role: "admin" }
  });
  expect(createError).toBeNull();
  expect(created.user).not.toBeNull();

  try {
    const { data: link, error: linkError } = await serviceClient.auth.admin.generateLink({
      type: "magiclink",
      email
    });
    expect(linkError).toBeNull();
    const emailOtp = link.properties?.email_otp;
    expect(emailOtp).toMatch(/^\d{6,8}$/);
    if (!emailOtp) throw new Error("Supabase did not return an email OTP.");

    const verification = await page.request.post("/api/admin/auth/verify", {
      data: { email, token: emailOtp }
    });
    expect(verification.status()).toBe(200);
    await page.goto("/admin");
    await expect(page.getByRole("heading", { name: "새 레슨 가져오기" })).toBeVisible();

    const response = await page.request.post("/api/admin/drafts", {
      multipart: {
        title,
        language: "japanese",
        targetFile: {
          name: "target.txt",
          mimeType: "text/plain",
          buffer: Buffer.from(targetSource)
        },
        koreanFile: {
          name: "ko.txt",
          mimeType: "text/plain",
          buffer: Buffer.from(koreanSource)
        }
      }
    });
    expect(response.status()).toBe(201);
    const payload = (await response.json()) as { draftId: string };
    expect(payload.draftId).toMatch(/^[0-9a-f-]{36}$/);

    const authenticatedClient = createClient(supabaseUrl, publishableKey, {
      auth: { autoRefreshToken: false, persistSession: false }
    });
    const { data: readLink, error: readLinkError } = await serviceClient.auth.admin.generateLink({
      type: "magiclink",
      email
    });
    expect(readLinkError).toBeNull();
    const readOtp = readLink.properties?.email_otp;
    expect(readOtp).toMatch(/^\d{6,8}$/);
    if (!readOtp) throw new Error("Supabase did not return the read-session OTP.");

    const { error: signInError } = await authenticatedClient.auth.verifyOtp({
      email,
      token: readOtp,
      type: "email"
    });
    expect(signInError).toBeNull();

    const { data: row, error: readError } = await authenticatedClient
      .from("lesson_drafts")
      .select("*")
      .eq("id", payload.draftId)
      .single();
    expect(readError).toBeNull();
    expect(row).toMatchObject({
      id: payload.draftId,
      created_by: created.user!.id,
      title,
      language: "japanese",
      target_filename: "target.txt",
      korean_filename: "ko.txt",
      target_source: targetSource,
      korean_source: koreanSource,
      validation_issues: [],
      validation_status: "validated",
      phrase_count: 2,
      chapter_count: 1,
      section_count: 1
    });
    expect(row.parsed_entries).toEqual([
      {
        kind: "chapter",
        sourceLine: 1,
        target: "Morning Routine",
        korean: "아침 일과"
      },
      {
        kind: "phrase",
        sourceLine: 2,
        phraseNumber: 1,
        target: "Good morning.",
        korean: "좋은 아침입니다."
      },
      { kind: "section", sourceLine: 3 },
      {
        kind: "phrase",
        sourceLine: 4,
        phraseNumber: 2,
        target: "I wash my face.",
        korean: "세수합니다."
      }
    ]);
  } finally {
    if (created.user) {
      await serviceClient.auth.admin.deleteUser(created.user.id);
    }
  }
});
