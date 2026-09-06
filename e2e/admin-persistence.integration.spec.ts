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
  const scriptSource = '## Morning Routine\nおはよう ございます。\n좋은 아침입니다.\n\n「何を読みますか？」\n「小説です。」\n"무엇을 읽어요?"\n"소설이에요."\n';

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
        scriptFile: {
          name: "script.txt",
          mimeType: "text/plain",
          buffer: Buffer.from(scriptSource)
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
      target_filename: "script.txt",
      korean_filename: "script.txt",
      target_source: scriptSource,
      korean_source: "",
      validation_issues: [],
      validation_status: "validated",
      phrase_count: 2,
      chapter_count: 1,
      section_count: 0
    });
    expect(row.parsed_entries).toEqual([
      {
        kind: "chapter",
        sourceLine: 1,
        target: "Morning Routine",
        korean: ""
      },
      {
        kind: "phrase",
        sourceLine: 2,
        phraseNumber: 1,
        target: "おはよう ございます。",
        korean: "좋은 아침입니다."
      },
      {
        kind: "phrase",
        sourceLine: 5,
        phraseNumber: 2,
        target: "「何を読みますか？」\n「小説です。」",
        korean: '"무엇을 읽어요?"\n"소설이에요."'
      }
    ]);
  } finally {
    if (created.user) {
      await serviceClient.auth.admin.deleteUser(created.user.id);
    }
  }
});
