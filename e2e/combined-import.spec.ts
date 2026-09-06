import { expect, type Page, test } from "@playwright/test";

const script = [
  "## Section 1",
  "",
  "Open the window.",
  "창문을 열어 주세요.",
  "",
  '"Is it cold?"',
  '"A little."',
  '"추워요?"',
  '"조금요."'
].join("\n");

async function openCombinedImport(page: Page) {
  const login = await page.request.post("/api/admin/auth/verify", {
    data: { email: "admin@example.com", token: "123456" }
  });
  expect(login.status()).toBe(200);
  await page.goto("/admin");
  await expect(page.locator('form[data-admin-ready="true"]')).toBeVisible();
  await page.getByLabel("레슨 제목").fill("Window conversation");
}

test("the draft API accepts one combined script without splitting a dialogue into extra audio phrases", async ({ page }) => {
  const login = await page.request.post("/api/admin/auth/verify", {
    data: { email: "admin@example.com", token: "123456" }
  });
  expect(login.status()).toBe(200);

  const response = await page.request.post("/api/admin/drafts/validate", {
    multipart: {
      title: "Window conversation",
      language: "english",
      scriptFile: { name: "script.txt", mimeType: "text/plain", buffer: Buffer.from(script) }
    }
  });

  expect(response.status()).toBe(200);
  await expect(response.json()).resolves.toMatchObject({
    result: {
      publishReady: true,
      issues: [],
      summary: { phrases: 2, chapters: 1, sections: 0 },
      entries: [
        { kind: "chapter", sourceLine: 1, target: "Section 1", korean: "" },
        { kind: "phrase", sourceLine: 3, phraseNumber: 1, target: "Open the window.", korean: "창문을 열어 주세요." },
        { kind: "phrase", sourceLine: 6, phraseNumber: 2, target: '"Is it cold?"\n"A little."', korean: '"추워요?"\n"조금요."' }
      ]
    }
  });
});

test("one-file import previews preserved dialogue lines, matches one audio per phrase and saves", async ({ page }) => {
  await openCombinedImport(page);
  await expect(page.locator('input[type="file"][accept=".txt,text/plain"]')).toHaveCount(1);
  await expect(page.getByLabel("목표어 텍스트")).toHaveCount(0);
  await expect(page.getByLabel("한국어 텍스트")).toHaveCount(0);
  await page.getByLabel("통합 스크립트", { exact: true }).setInputFiles({
    name: "script.txt", mimeType: "text/plain", buffer: Buffer.from(script)
  });
  await page.getByLabel("문장별 음성 파일").setInputFiles([
    { name: "002-dialogue.mp3", mimeType: "audio/mpeg", buffer: Buffer.from([2]) },
    { name: "001-window.mp3", mimeType: "audio/mpeg", buffer: Buffer.from([1]) }
  ]);
  await page.getByRole("button", { name: "파일 검증" }).click();

  await expect(page.getByText("2개 프레이즈 · 1개 챕터 · 0개 구간 · 오류 없음")).toBeVisible();
  await expect(page.getByText("2 / 2 연결 · 게시 가능")).toBeVisible();
  const dialogueRow = page.getByRole("row").filter({ hasText: "Is it cold?" });
  const targetCell = dialogueRow.getByRole("cell").nth(2);
  expect(await targetCell.textContent()).toBe('"Is it cold?"\n"A little."');
  await expect(targetCell).toHaveCSS("white-space", "pre-wrap");
  await expect(dialogueRow).toContainText("002-dialogue.mp3");
  await page.getByRole("button", { name: "초안 저장" }).click();
  await expect(page.getByRole("status")).toHaveText("초안이 저장되었습니다.");
  await expect(page.getByRole("button", { name: "음성 업로드 후 게시" })).toBeEnabled();

  await page.getByLabel("통합 스크립트", { exact: true }).setInputFiles({
    name: "changed.txt", mimeType: "text/plain", buffer: Buffer.from("Close the window.\n창문을 닫아 주세요.")
  });
  await expect(page.getByRole("region", { name: "검증 미리보기" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "음성 업로드 후 게시" })).toHaveCount(0);
});

test("a changed combined source clears validation and reports a missing translation", async ({ page }) => {
  await openCombinedImport(page);
  const file = page.getByLabel("통합 스크립트", { exact: true });
  await file.setInputFiles({ name: "script.txt", mimeType: "text/plain", buffer: Buffer.from(script) });
  await page.getByRole("button", { name: "파일 검증" }).click();
  await expect(page.getByText("검증 완료", { exact: true })).toBeVisible();
  await file.setInputFiles({ name: "changed.txt", mimeType: "text/plain", buffer: Buffer.from("## Section 1\n\nWhere is my book?") });
  await expect(page.getByRole("region", { name: "검증 미리보기" })).toHaveCount(0);
  await page.getByRole("button", { name: "파일 검증" }).click();
  await expect(page.getByRole("region", { name: "검증 미리보기" }).getByRole("alert")).toContainText("3행");
  await expect(page.getByText("게시 준비 불가")).toBeVisible();
  await expect(page.getByRole("button", { name: "음성 업로드 후 게시" })).toBeDisabled();
});

for (const action of [
  { path: "validate", button: "파일 검증", pending: "검증 중…" },
  { path: "save", button: "초안 저장", pending: "저장 중…" }
]) test(`changing the script while ${action.path} is in flight cannot restore a stale preview`, async ({ page }) => {
  await openCombinedImport(page);
  await page.getByLabel("통합 스크립트", { exact: true }).setInputFiles({ name: "script.txt", mimeType: "text/plain", buffer: Buffer.from(script) });
  if (action.path === "save") {
    await page.getByRole("button", { name: "파일 검증" }).click();
    await expect(page.getByText("검증 완료", { exact: true })).toBeVisible();
  }
  let releaseResponse!: () => void;
  const responseGate = new Promise<void>(resolve => { releaseResponse = resolve; });
  await page.route(action.path === "validate" ? "**/api/admin/drafts/validate" : "**/api/admin/drafts", async route => {
    const response = await route.fetch();
    await responseGate;
    await route.fulfill({ response });
  });
  try {
    await page.getByRole("button", { name: action.button }).click();
    await expect(page.getByRole("button", { name: action.pending })).toBeDisabled();
    await page.getByLabel("통합 스크립트", { exact: true }).setInputFiles({
      name: "changed.txt", mimeType: "text/plain", buffer: Buffer.from("Close the window.\n창문을 닫아 주세요.")
    });
  } finally {
    releaseResponse();
  }
  await expect(page.getByRole("button", { name: "파일 검증" })).toBeEnabled();
  await expect(page.getByRole("region", { name: "검증 미리보기" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "음성 업로드 후 게시" })).toHaveCount(0);
  await expect(page.getByText("초안이 저장되었습니다.", { exact: true })).toHaveCount(0);
});

test("duplicate scriptFile parts are rejected instead of silently ignoring a TXT", async ({ page }) => {
  await openCombinedImport(page);
  const form = new FormData();
  form.set("title", "Window conversation");
  form.set("language", "english");
  form.append("scriptFile", new File([script], "first.txt", { type: "text/plain" }));
  form.append("scriptFile", new File(["Close the window.\n창문을 닫아 주세요."], "second.txt", { type: "text/plain" }));
  const response = await page.request.post("/api/admin/drafts/validate", { multipart: form });
  expect(response.status()).toBe(400);
  await expect(response.json()).resolves.toMatchObject({ error: "통합 스크립트는 TXT 파일 한 개만 선택해 주세요." });
});

test("new imports require one combined TXT instead of two separate language files", async ({ page }) => {
  await openCombinedImport(page);
  const response = await page.request.post("/api/admin/drafts/validate", {
    multipart: {
      title: "Window conversation", language: "english",
      targetFile: { name: "en.txt", mimeType: "text/plain", buffer: Buffer.from("Open the window.") },
      koreanFile: { name: "ko.txt", mimeType: "text/plain", buffer: Buffer.from("창문을 열어 주세요.") }
    }
  });
  expect(response.status()).toBe(400);
  await expect(response.json()).resolves.toMatchObject({ error: "통합 스크립트 파일을 선택해 주세요." });
});

for (const [name, buffer, status, message] of [
  ["script.csv", Buffer.from(script), 400, ".txt 형식"],
  ["script.txt", Buffer.from([0xff, 0xfe]), 400, "UTF-8"],
  ["script.txt", Buffer.alloc(2 * 1024 * 1024 + 1, "a"), 413, "2MB"]
] as const) {
  test(`combined TXT validation retains the ${message} guard`, async ({ page }) => {
    await openCombinedImport(page);
    const response = await page.request.post("/api/admin/drafts/validate", {
      multipart: {
        title: "Window conversation", language: "english",
        scriptFile: { name, mimeType: "text/plain", buffer }
      }
    });
    expect(response.status()).toBe(status);
    expect((await response.json()).error).toContain(message);
  });
}
