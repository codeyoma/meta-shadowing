import { randomUUID } from "node:crypto";
import { expect, test } from "@playwright/test";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

const integrationEnabled = process.env.ADMIN_SUPABASE_INTEGRATION === "1";
const TEST_WEBM_BASE64 =
  "GkXfo59ChoEBQveBAULygQRC84EIQoKEd2VibUKHgQRChYECGFOAZwH/////////FUmpZpkq17GDD0JATYCGQ2hyb21lV0GGQ2hyb21lFlSua7+uvdeBAXPFh66ru3m7D4GDgQKGhkFfT1BVU2Oik09wdXNIZWFkAQIAAIC7AAAAAADhjbWERzuAAJ+BAmJkgSAfQ7Z1Af/////////ngQCjrIEAAIAY4DS5l0C1XAIsifMfvrNWxLKc86HhO6VEb7z9oOU3T28pdxxnTmTJo6iBADyAGMHI8BlHdEHCVMGu05gLBgj4emwVBLWN1xbBZazgQKOxor2AH0O2dQH/////////54F1o6WBAACAGAiA/8jL2Mfg7FNHZso2F4OvjixR5e82E/WmKaozzJjAo6eBADyAGAiEIhzSwbkVJIcfk1H2DNwGJ34oAoC7qAKsqJajKihF6TYfQ7Z1Af/////////ngfCjpIEAAIAYCIQiHNS4J7sHL5U06nBw+jB7XR8oPsPO/W6R7YKOgKOlgQA8gBgIhCIc0q3RNGE3lgynT4sEncZJ+LbuGRlrocUVKBIkYR9DtnUB/////////+eCAWWjpYEAAIAYCIQiHNSwFnjGJHdAOULzdO+SOfP0g6FSgCKkyQwlFDo=";

test.skip(!integrationEnabled, "requires the project-local Supabase stack");

async function signInWithEmailOtp(client: SupabaseClient, serviceClient: SupabaseClient, email: string) {
  const { data: link, error: linkError } = await serviceClient.auth.admin.generateLink({
    type: "magiclink",
    email
  });
  expect(linkError).toBeNull();
  const token = link.properties?.email_otp;
  expect(token).toMatch(/^\d{6,8}$/);
  if (!token) throw new Error("Supabase did not return an email OTP.");

  const { error } = await client.auth.verifyOtp({ email, token, type: "email" });
  expect(error).toBeNull();
}

test("only a complete private audio package can be published and played by a beta learner", async ({
  page,
  request
}) => {
  const supabaseUrl = process.env.SUPABASE_INTEGRATION_URL!;
  const publishableKey = process.env.SUPABASE_INTEGRATION_PUBLISHABLE_KEY!;
  const secretKey = process.env.SUPABASE_INTEGRATION_SECRET_KEY!;
  const adminEmail = `audio-admin-${randomUUID()}@example.com`;
  const learnerEmail = `audio-learner-${randomUUID()}@example.com`;
  const title = "게시 통합 테스트 레슨";
  const targetSource = "## First chapter\nGood morning.\n\nI wash my face.\n";
  const koreanSource = "## 첫 챕터\n좋은 아침입니다.\n\n세수합니다.\n";
  const serviceClient = createClient(supabaseUrl, secretKey, {
    auth: { autoRefreshToken: false, persistSession: false }
  });
  const adminClient = createClient(supabaseUrl, publishableKey, {
    auth: { autoRefreshToken: false, persistSession: false }
  });
  const learnerClient = createClient(supabaseUrl, publishableKey, {
    auth: { autoRefreshToken: false, persistSession: false }
  });

  const { data: createdAdmin, error: adminCreateError } = await serviceClient.auth.admin.createUser({
    email: adminEmail,
    email_confirm: true,
    app_metadata: { role: "admin" }
  });
  const { data: createdLearner, error: learnerCreateError } = await serviceClient.auth.admin.createUser({
    email: learnerEmail,
    email_confirm: true,
    app_metadata: { role: "learner" }
  });
  expect(adminCreateError).toBeNull();
  expect(learnerCreateError).toBeNull();
  if (!createdAdmin.user || !createdLearner.user) throw new Error("Integration users were not created.");

  const uploadedPaths: string[] = [];
  try {
    const { data: browserLink, error: browserLinkError } = await serviceClient.auth.admin.generateLink({
      type: "magiclink",
      email: adminEmail
    });
    expect(browserLinkError).toBeNull();
    const browserOtp = browserLink.properties?.email_otp;
    if (!browserOtp) throw new Error("Supabase did not return the browser email OTP.");
    const browserVerification = await page.request.post("/api/admin/auth/verify", {
      data: { email: adminEmail, token: browserOtp }
    });
    expect(browserVerification.status()).toBe(200);

    await signInWithEmailOtp(adminClient, serviceClient, adminEmail);
    await signInWithEmailOtp(learnerClient, serviceClient, learnerEmail);

    const rejectedUpload = await learnerClient.storage
      .from("lesson-audio")
      .upload(`${createdLearner.user.id}/${randomUUID()}/001.webm`, new Uint8Array([1, 2, 3]), {
        contentType: "audio/webm"
      });
    expect(rejectedUpload.error?.message).toContain("row-level security");

    await page.goto("/admin");
    await expect(page.getByRole("heading", { name: "새 레슨 가져오기" })).toBeVisible();
    const audioBytes = Buffer.from(TEST_WEBM_BASE64, "base64");
    expect(audioBytes.byteLength).toBeGreaterThan(100);

    await page.getByLabel("레슨 제목").fill(title);
    await page.getByLabel("언어").selectOption("english");
    await page.getByLabel("목표어 텍스트").setInputFiles({
      name: "target.txt",
      mimeType: "text/plain",
      buffer: Buffer.from(targetSource)
    });
    await page.getByLabel("한국어 텍스트").setInputFiles({
      name: "ko.txt",
      mimeType: "text/plain",
      buffer: Buffer.from(koreanSource)
    });
    await page.getByLabel("문장별 음성 파일").setInputFiles({
      name: "001-first.webm",
      mimeType: "audio/webm",
      buffer: audioBytes
    });
    await page.getByRole("button", { name: "파일 검증" }).click();
    await expect(page.getByText("1 / 2 연결 · 확인 필요")).toBeVisible();

    const draftSaved = page.waitForResponse((response) => {
      const url = new URL(response.url());
      return url.pathname === "/api/admin/drafts" && response.request().method() === "POST";
    });
    await page.getByRole("button", { name: "초안 저장" }).click();
    const draftResponse = await draftSaved;
    expect(draftResponse.status()).toBe(201);
    const { draftId } = (await draftResponse.json()) as { draftId: string };
    const folder = `${createdAdmin.user.id}/${draftId}`;

    const { data: hiddenLessons, error: hiddenLessonsError } = await serviceClient
      .from("lesson_drafts")
      .select("id")
      .eq("id", draftId)
      .eq("publication_status", "published");
    expect(hiddenLessonsError).toBeNull();
    expect(hiddenLessons).toEqual([]);

    const firstPath = `${folder}/001.webm`;
    const firstUpload = await adminClient.storage.from("lesson-audio").upload(firstPath, audioBytes, {
      contentType: "audio/webm"
    });
    expect(firstUpload.error).toBeNull();
    uploadedPaths.push(firstPath);

    const replacement = await adminClient.storage.from("lesson-audio").upload(firstPath, audioBytes, {
      contentType: "audio/webm",
      upsert: true
    });
    expect(replacement.error).toBeNull();

    const incompletePublish = await page.request.post(`/api/admin/drafts/${draftId}/publish`);
    expect(incompletePublish.status()).toBe(422);
    await expect(incompletePublish.json()).resolves.toMatchObject({
      error: "audio-package-invalid",
      result: { publishReady: false }
    });

    const secondPath = `${folder}/002.webm`;
    uploadedPaths.push(secondPath);
    const secondUpload = await adminClient.storage.from("lesson-audio").upload(secondPath, audioBytes, {
      contentType: "audio/webm"
    });
    expect(secondUpload.error).toBeNull();
    const corruptReplacement = await adminClient.storage
      .from("lesson-audio")
      .upload(firstPath, Uint8Array.from([0x52, 0x49, 0x46, 0x46]), {
        contentType: "audio/webm",
        upsert: true
      });
    expect(corruptReplacement.error).toBeNull();
    const corruptPublish = await page.request.post(`/api/admin/drafts/${draftId}/publish`);
    expect(corruptPublish.status()).toBe(422);
    await expect(corruptPublish.json()).resolves.toMatchObject({
      error: "audio-package-invalid",
      result: {
        publishReady: false,
        issues: [{ code: "invalid-audio-content", phraseNumber: 1 }]
      }
    });

    await page.getByLabel("문장별 음성 파일").setInputFiles([
      { name: "002-second.webm", mimeType: "audio/webm", buffer: audioBytes },
      { name: "001-first.webm", mimeType: "audio/webm", buffer: audioBytes }
    ]);
    await expect(page.getByText("2 / 2 연결 · 게시 가능")).toBeVisible();
    const publishedResponse = page.waitForResponse((response) =>
      response.url().endsWith(`/api/admin/drafts/${draftId}/publish`)
    );
    await page.getByRole("button", { name: "음성 업로드 후 게시" }).click();
    const publish = await publishedResponse;
    expect(publish.status()).toBe(200);
    await expect(publish.json()).resolves.toMatchObject({
      lessonId: draftId,
      result: { publishReady: true }
    });
    await expect(page.getByRole("status")).toHaveText("레슨이 게시되었습니다.");

    const unauthorizedPlayback = await request.get(`/api/lessons/${draftId}/audio/1`, {
      maxRedirects: 0
    });
    expect(unauthorizedPlayback.status()).toBe(401);

    const learnerEntry = await page.request.post("/api/auth", {
      data: { password: "integration-beta-password" }
    });
    expect(learnerEntry.status()).toBe(200);

    await page.goto("/home");
    await expect(page.getByText(title)).toBeVisible();

    const playback = await page.request.get(`/api/lessons/${draftId}/audio/1`, {
      maxRedirects: 0
    });
    expect(playback.status()).toBe(307);
    expect(playback.headers()["cache-control"]).toBe("private, no-store");
    const signedUrl = playback.headers().location;
    expect(signedUrl).toContain("/storage/v1/object/sign/lesson-audio/");

    const storedAudio = await page.request.get(signedUrl);
    expect(storedAudio.status()).toBe(200);
    expect(Buffer.from(await storedAudio.body())).toEqual(audioBytes);

    await page.goto(`/player?lesson=${draftId}&level=1`);
    await expect(page.getByText("Good morning.")).toBeVisible();
    await page.getByRole("button", { name: "첫 원음 듣기" }).click();
    await expect
      .poll(() =>
        page.locator("audio").evaluate((audio) => {
          const player = audio as HTMLAudioElement;
          return player.currentTime > 0 || player.ended;
        })
      )
      .toBe(true);
  } finally {
    if (uploadedPaths.length) await serviceClient.storage.from("lesson-audio").remove(uploadedPaths);
    await serviceClient.auth.admin.deleteUser(createdAdmin.user.id);
    await serviceClient.auth.admin.deleteUser(createdLearner.user.id);
  }
});
