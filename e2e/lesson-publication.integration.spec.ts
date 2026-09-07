import { randomUUID } from "node:crypto";
import { expect, test } from "@playwright/test";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { confirmManualListen } from "./fixtures/manual-practice";

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

test("a saved 560-file draft recovers from a text timeout without reuploading any audio", async ({ page }) => {
  test.setTimeout(120000);
  const url = process.env.SUPABASE_INTEGRATION_URL!;
  if (!["127.0.0.1", "localhost"].includes(new URL(url).hostname)) throw new Error("Local fixtures only");
  const options = { auth: { persistSession: false, autoRefreshToken: false } };
  const service = createClient(url, process.env.SUPABASE_INTEGRATION_SECRET_KEY!, options);
  const admin = createClient(url, process.env.SUPABASE_INTEGRATION_PUBLISHABLE_KEY!, options);
  const email = `recovery-${randomUUID()}@example.com`;
  const { data, error } = await service.auth.admin.createUser({ email, email_confirm: true, app_metadata: { role: "admin" } });
  expect(error).toBeNull();
  const owner = data.user!.id;
  const paths: string[] = [];
  try {
    const { data: link } = await service.auth.admin.generateLink({ type: "magiclink", email });
    expect((await page.request.post("/api/admin/auth/verify", { data: { email, token: link.properties!.email_otp } })).status()).toBe(200);
    await signInWithEmailOtp(admin, service, email);
    const source = Array.from({ length: 560 }, (_, index) => `Practice phrase ${index + 1}.\n연습 문장 ${index + 1}.`).join("\n");
    const saved = await page.request.post("/api/admin/drafts", { multipart: {
      title: "Large recovery fixture", language: "english",
      scriptFile: { name: "script.txt", mimeType: "text/plain", buffer: Buffer.from(source) }
    } });
    expect(saved.status()).toBe(201);
    const { draftId } = await saved.json();
    const folder = `${owner}/${draftId}`;
    const bytes = Buffer.from(TEST_WEBM_BASE64, "base64");
    for (let offset = 0; offset < 560; offset += 8) {
      await Promise.all(Array.from({ length: Math.min(8, 560 - offset) }, async (_, index) => {
        const path = `${folder}/${String(offset + index + 1).padStart(3, "0")}.webm`;
        paths.push(path);
        expect((await admin.storage.from("lesson-audio").upload(path, bytes, { contentType: "audio/webm" })).error).toBeNull();
      }));
    }
    // Characterize the exact authenticated Range request used by publication.
    const rangeRequest = { headers: { Range: "bytes=0-11" }, cache: "no-store" as const };
    const signature = await admin.storage.from("lesson-audio").download(paths[0], {}, rangeRequest);
    expect(signature.error).toBeNull();
    expect(signature.data!.size).toBe(12);
    const before = await service.storage.from("lesson-audio").list(folder, { limit: 1000, sortBy: { column: "name", order: "asc" } });
    expect(before.error).toBeNull();
    expect(before.data).toHaveLength(560);
    let browserStorageWrites = 0;
    page.on("request", request => {
      if (request.url().includes("/storage/v1/") && !["GET", "HEAD"].includes(request.method())) browserStorageWrites++;
    });
    await page.goto("/admin/lessons");
    const row = page.getByRole("listitem").filter({ hasText: "Large recovery fixture" });
    await page.route(`**/api/admin/drafts/${draftId}/publish`, route => route.fulfill({ status: 504, contentType: "text/plain", body: "An error occurred" }), { times: 1 });
    await expect(row.getByRole("button", { name: "업로드된 음성으로 게시" })).toBeVisible();
    await row.getByRole("button", { name: "업로드된 음성으로 게시" }).click();
    await expect(page.getByRole("alert")).toContainText("시간");
    await expect(page.getByRole("alert")).not.toContainText("Unexpected");
    const published = page.waitForResponse(response => response.url().endsWith(`/api/admin/drafts/${draftId}/publish`));
    const started = Date.now();
    await row.getByRole("button", { name: "업로드된 음성으로 게시" }).click();
    expect((await published).status()).toBe(200);
    expect(Date.now() - started).toBeLessThan(30000);
    await expect(row).toContainText("게시 중");
    await expect(row.getByRole("button", { name: "업로드된 음성으로 게시" })).toHaveCount(0);
    expect(browserStorageWrites).toBe(0);
    const after = await service.storage.from("lesson-audio").list(folder, { limit: 1000, sortBy: { column: "name", order: "asc" } });
    const immutableMetadata = (files: NonNullable<typeof before.data>) => files.map(file => [file.id, file.name, file.updated_at, file.metadata?.size]);
    expect(after.error).toBeNull();
    expect(immutableMetadata(after.data!)).toEqual(immutableMetadata(before.data!));
    const result = await service.from("lesson_drafts").select("publication_status, audio_manifest").eq("id", draftId).single();
    expect(result.data?.publication_status).toBe("published");
    expect(result.data?.audio_manifest).toHaveLength(560);
    // A pending replacement must remain recoverable while the old version stays published.
    const replacement = await page.request.post("/api/admin/drafts", { multipart: {
      title: "Recovered replacement", language: "english", replacementFor: draftId,
      scriptFile: { name: "replacement.txt", mimeType: "text/plain", buffer: Buffer.from("Hello again.\n다시 안녕하세요.") }
    } });
    expect(replacement.status()).toBe(201);
    const pendingId = (await replacement.json()).draftId;
    const pendingPath = `${owner}/${pendingId}/001.webm`;
    paths.push(pendingPath);
    expect((await admin.storage.from("lesson-audio").upload(pendingPath, bytes, { contentType: "audio/webm" })).error).toBeNull();
    const newerDraft = await page.request.post("/api/admin/drafts", { multipart: {
      title: "Newer draft without audio", language: "english", replacementFor: draftId,
      scriptFile: { name: "newer.txt", mimeType: "text/plain", buffer: Buffer.from("Try later.\n나중에 시도하세요.") }
    } });
    expect(newerDraft.status()).toBe(201);
    await page.reload();
    await expect(row).toContainText("게시 중");
    await page.setViewportSize({ width: 393, height: 851 });
    await expect(row.getByLabel("게시할 초안")).toBeVisible();
    expect((await row.getByLabel("게시할 초안").boundingBox())!.height).toBeGreaterThanOrEqual(48);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    await row.getByLabel("게시할 초안").selectOption(pendingId);
    await expect(row.getByRole("button", { name: "업로드된 음성으로 게시" })).toBeVisible();
    await row.getByRole("button", { name: "업로드된 음성으로 게시" }).click();
    const replaced = page.getByRole("listitem").filter({ hasText: "Recovered replacement" });
    await expect(replaced).toContainText("게시 중");
    await expect(replaced).toContainText("2개 버전");
    expect(browserStorageWrites).toBe(0);
    await page.setViewportSize({ width: 393, height: 851 });
    await page.screenshot({ path: test.info().outputPath("publication-recovery-mobile.png") });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  } finally {
    if (paths.length) expect((await service.storage.from("lesson-audio").remove(paths)).error).toBeNull();
    expect((await service.from("lesson_drafts").delete().eq("created_by", owner)).error).toBeNull();
    expect((await service.auth.admin.deleteUser(owner)).error).toBeNull();
  }
});

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
  const targetDialogue = "Good morning.\nWelcome home.";
  const koreanDialogue = "좋은 아침입니다.\n어서 오세요.";
  const scriptSource = `## First chapter\n\n${targetDialogue}\n${koreanDialogue}\n\n## Second chapter\nI wash my face.\n세수합니다.\n`;
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
    await page.getByLabel("통합 스크립트", { exact: true }).setInputFiles({
      name: "script.txt",
      mimeType: "text/plain",
      buffer: Buffer.from(scriptSource)
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
    let uploadWrites = 0;
    page.on("request", request => {
      if (request.url().includes("/storage/v1/object/lesson-audio/") && request.method() === "POST") uploadWrites++;
    });
    await page.route(`**/api/admin/drafts/${draftId}/publish`, route => route.fulfill({
      status: 504, contentType: "text/plain", body: "An error occurred: FUNCTION_INVOCATION_TIMEOUT"
    }), { times: 1 });
    await page.getByRole("button", { name: "음성 업로드 후 게시" }).click();
    await expect(page.getByRole("alert")).toContainText("시간");
    await expect(page.getByRole("alert")).not.toContainText("Unexpected token");
    expect(uploadWrites).toBe(2);
    const publishedResponse = page.waitForResponse((response) =>
      response.url().endsWith(`/api/admin/drafts/${draftId}/publish`)
    );
    await page.getByRole("button", { name: "게시만 다시 시도" }).click();
    const publish = await publishedResponse;
    expect(publish.status()).toBe(200);
    await expect(publish.json()).resolves.toMatchObject({
      lessonId: draftId,
      result: { publishReady: true }
    });
    await expect(page.getByRole("status")).toHaveText("레슨이 게시되었습니다.");
    expect(uploadWrites).toBe(2);

    const unauthorizedPlayback = await request.get(`/api/lessons/${draftId}/audio/1`, {
      maxRedirects: 0
    });
    expect(unauthorizedPlayback.status()).toBe(401);

    const learnerEntry = await page.request.post("/api/auth", {
      data: { password: "integration-beta-password" }
    });
    expect(learnerEntry.status()).toBe(200);

    await page.goto("/lessons?language=english");
    await expect(page.getByText(title)).toBeVisible();

    await page.goto(`/setup?lesson=${draftId}`);
    await expect(page.getByRole("heading", { level: 1, name: title, exact: true })).toBeVisible();
    await expect(page.getByText(title, { exact: true })).toHaveCount(1);
    await page.screenshot({ path: test.info().outputPath("setup-title-desktop.png") });
    const originalViewport = page.viewportSize();
    await page.setViewportSize({ width: 393, height: 851 });
    await expect(page.getByRole("heading", { level: 1, name: title, exact: true })).toBeVisible();
    await expect(page.getByText(title, { exact: true })).toHaveCount(1);
    await page.screenshot({ path: test.info().outputPath("setup-title-mobile.png") });
    if (originalViewport) await page.setViewportSize(originalViewport);

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
    await expect(page.getByRole("main").getByText(title, { exact: true })).toBeVisible();
    await expect(page.getByText(targetDialogue, { exact: true })).toBeVisible();
    await expect(page.getByText(targetDialogue, { exact: true })).toHaveCSS("white-space", "pre-wrap");
    await page.getByRole("button", { name: "CONTINUE · 첫 원음 듣기" }).click();
    await expect
      .poll(() =>
        page.locator("audio").evaluate((audio) => {
          const player = audio as HTMLAudioElement;
          return player.currentTime > 0 || player.ended;
        })
      )
      .toBe(true);
    await confirmManualListen(page);
    await expect(page.getByLabel("완료한 듣기")).toHaveText("필수 1 / 3");
    for (const cycle of [2, 3]) {
      await confirmManualListen(page, "keyboard");
      await expect(page.getByLabel("완료한 듣기")).toHaveText(`필수 ${cycle} / 3`);
    }
    await page.keyboard.press("Space");
    await expect(page.getByText("I wash my face.", { exact: true })).toBeVisible();
    await page.keyboard.press("Space");
    for (const cycle of [1, 2, 3]) {
      await confirmManualListen(page, "keyboard");
      await expect(page.getByLabel("완료한 듣기")).toHaveText(`필수 ${cycle} / 3`);
    }
    await page.keyboard.press("Space");
    await expect(page.getByRole("heading", { name: "레벨 1 학습 완료" })).toBeVisible();
    for (const level of [2, 3, 4, 5]) {
      await page.goto(`/player?lesson=${draftId}&level=${level}`);
      await expect(page.getByRole("heading", { name: `메타쉐도잉 레벨 ${level}` })).toBeVisible();
      const subtitles = page.getByRole("region", { name: "학습 자막" });
      if (level === 3 || level === 5) {
        await expect(subtitles.getByText("Good", { exact: true })).toBeVisible();
        await expect(subtitles.getByText("좋은", { exact: true })).toBeVisible();
        await page.getByRole("button", { name: "자막 보기", exact: true }).click();
      }
      await expect(subtitles.getByText(targetDialogue, { exact: true })).toBeVisible();
      await expect(subtitles.getByText(koreanDialogue, { exact: true })).toBeVisible();
      await expect(subtitles.getByText(targetDialogue, { exact: true })).toHaveCSS("white-space", "pre-wrap");
      await expect(subtitles.getByText(koreanDialogue, { exact: true })).toHaveCSS("white-space", "pre-wrap");
      await page.getByRole("button", { name: "CONTINUE · 첫 원음 듣기", exact: true }).click();
      await confirmManualListen(page);
      await expect(page.getByLabel("완료한 듣기")).toHaveText("필수 1 / 3");
      if (level === 3 || level === 5) await expect(subtitles.getByText("Good", { exact: true })).toBeVisible();
      if (level >= 4) {
        const chapter = page.getByLabel("현재 챕터");
        await expect(chapter).toContainText("First chapter");
        await expect(subtitles.getByRole("listitem")).toHaveCount(1);
        await expect(page.getByRole("progressbar", { name: "묶음 진행" })).toHaveAttribute("aria-valuemax", "2");
        for (const cycle of [2, 3]) {
          await confirmManualListen(page, "keyboard");
          await expect(page.getByLabel("완료한 듣기")).toHaveText(`필수 ${cycle} / 3`);
        }
        await page.keyboard.press("Space");
        await expect(chapter).toContainText("Second chapter");
        await expect(chapter.getByRole("separator", { name: "구간 경계" })).toHaveCount(0);
        await expect(subtitles.getByRole("listitem")).toHaveCount(1);
        if (level === 5) await page.getByRole("button", { name: "자막 보기", exact: true }).click();
        await expect(subtitles.getByText("I wash my face.", { exact: true })).toBeVisible();
      }
    }

    const rapidAudioRequests: string[] = [];
    page.on("request", request => { if (request.url().includes("/audio/")) rapidAudioRequests.push(request.url()); });
    await page.clock.install({ time: new Date("2026-09-06T00:00:00Z") });
    await page.clock.pauseAt(new Date("2026-09-06T00:01:00Z"));
    for (const level of [6, 7, 8]) {
      await page.goto(`/player?lesson=${draftId}&level=${level}&wpm=6&mode=automatic&sectionGap=0.5`);
      await page.waitForLoadState("networkidle");
      await expect(page.getByRole("heading", { name: `메타쉐도잉 레벨 ${level}` })).toBeVisible();
      await expect(page.getByLabel("현재 챕터")).toHaveText("First chapter");
      await expect(page.getByRole("separator", { name: "구간 경계" })).toHaveCount(0);
      await expect(page.locator("audio")).toHaveCount(0);
      const canvas = page.getByRole("region", { name: "속사포 학습" });
      await page.keyboard.press("Space");
      await expect(canvas).toHaveText(level === 6 ? "Good" : "좋은");
      await page.clock.runFor(600);
      if (level === 6) {
        await expect(canvas).toHaveText("좋은");
        await page.clock.runFor(600);
      } else {
        await expect(page.getByRole("timer")).toHaveText("1.1초");
        await page.clock.runFor(1100);
        if (level === 7) {
          await expect(canvas).toHaveText("Good");
          await page.clock.runFor(600);
        }
      }
      await expect(page.getByRole("timer")).toHaveText("0.5초");
      await page.clock.runFor(500);
      await expect(canvas).toHaveText(level === 6 ? "I" : "세수합니다.");
      await expect(page.getByLabel("현재 챕터")).toHaveText("Second chapter");
      await expect(page.getByRole("separator", { name: "구간 경계" })).toHaveCount(0);
      await page.clock.runFor(5000);
      await expect(page.getByRole("heading", { name: `레벨 ${level} 학습 완료` })).toBeVisible();
    }
    expect(rapidAudioRequests).toEqual([]);
  } finally {
    if (uploadedPaths.length) await serviceClient.storage.from("lesson-audio").remove(uploadedPaths);
    await serviceClient.auth.admin.deleteUser(createdAdmin.user.id);
    await serviceClient.auth.admin.deleteUser(createdLearner.user.id);
  }
});
