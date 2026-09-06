import { expect, Page, test } from "@playwright/test";

async function signInAsConfiguredAdministrator(page: Page) {
  await page.goto("/admin");
  await expect(page.getByRole("heading", { name: "관리자 로그인" })).toBeVisible();

  await page.getByLabel("이메일").fill("admin@example.com");
  await page.getByRole("button", { name: "로그인 코드 받기" }).click();
  await page.getByLabel("인증 코드").fill("123456");
  await page.getByRole("button", { name: "확인하고 계속" }).click();

  await expect(page.getByRole("heading", { name: "새 레슨 가져오기" })).toBeVisible();
  await expect(page.locator('form[data-admin-ready="true"]')).toBeVisible();
}

test("an existing administrator validates, previews, and saves a bilingual text draft", async ({ page }) => {
  await signInAsConfiguredAdministrator(page);

  await page.getByLabel("레슨 제목").fill("아침 일과");
  await page.getByLabel("언어").selectOption("japanese");
  await page.getByLabel("통합 스크립트", { exact: true }).setInputFiles({
    name: "script.txt",
    mimeType: "text/plain",
    buffer: Buffer.from("## Morning Routine\nおはよう ございます。\n좋은 아침입니다.\n\n顔を 洗います。\n세수합니다.\n")
  });

  await page.getByRole("button", { name: "파일 검증" }).click();

  await expect(page.getByText("2개 프레이즈 · 1개 챕터 · 0개 구간 · 오류 없음")).toBeVisible();
  await expect(page.getByRole("cell", { name: /Morning Routine/ })).toBeVisible();
  await expect(page.getByRole("cell", { name: /おはよう ございます。/ })).toBeVisible();
  await expect(page.getByRole("cell", { name: /좋은 아침입니다\./ })).toBeVisible();

  await page.getByRole("button", { name: "초안 저장" }).click();
  await expect(page.getByRole("status")).toHaveText("초안이 저장되었습니다.");
});

test("a phrase missing its translation remains blocked from publish-ready status", async ({ page }) => {
  await signInAsConfiguredAdministrator(page);

  await page.getByLabel("레슨 제목").fill("Morning Routine");
  await page.getByLabel("통합 스크립트", { exact: true }).setInputFiles({
    name: "script.txt",
    mimeType: "text/plain",
    buffer: Buffer.from("I wake up at seven.\n나는 일곱 시에 일어난다.\nI wash my face.\n")
  });

  await page.getByRole("button", { name: "파일 검증" }).click();

  await expect(
    page.getByRole("region", { name: "검증 미리보기" }).getByRole("alert")
  ).toContainText("3행부터 시작한 프레이즈에 한국어 번역이 없습니다");
  await expect(page.getByText("게시 준비 불가")).toBeVisible();
});

test("changing the combined source file clears a stale validation preview", async ({ page }) => {
  await signInAsConfiguredAdministrator(page);

  await page.getByLabel("레슨 제목").fill("Morning Routine");
  await page.getByLabel("통합 스크립트", { exact: true }).setInputFiles({
    name: "script.txt",
    mimeType: "text/plain",
    buffer: Buffer.from("Good morning.\n좋은 아침입니다.\n")
  });

  await page.getByRole("button", { name: "파일 검증" }).click();
  await expect(page.getByText("검증 완료")).toBeVisible();

  await page.getByLabel("통합 스크립트", { exact: true }).setInputFiles({
    name: "changed-script.txt",
    mimeType: "text/plain",
    buffer: Buffer.from("Good morning.\n좋은 아침입니다.\nHow are you?\n잘 지내요?\n")
  });

  await expect(page.getByRole("region", { name: "검증 미리보기" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "초안 저장" })).toHaveCount(0);
});

test("naturally maps sentence audio and blocks duplicate numbers before upload", async ({ page }) => {
  await signInAsConfiguredAdministrator(page);

  await page.getByLabel("레슨 제목").fill("Morning Routine");
  await page.getByLabel("통합 스크립트", { exact: true }).setInputFiles({
    name: "script.txt",
    mimeType: "text/plain",
    buffer: Buffer.from("## Morning\nGood morning.\n좋은 아침입니다.\n\nI wash my face.\n세수합니다.\n")
  });
  await page.getByRole("button", { name: "파일 검증" }).click();

  await page.getByLabel("문장별 음성 파일").setInputFiles([
    { name: "002-wash.webm", mimeType: "audio/webm", buffer: Buffer.from([2]) },
    { name: "001-morning.mp3", mimeType: "audio/mpeg", buffer: Buffer.from([1]) }
  ]);
  await expect(page.getByText("2 / 2 연결 · 게시 가능")).toBeVisible();
  await expect(page.getByRole("row").filter({ hasText: "Good morning." })).toContainText("001-morning.mp3");
  await expect(page.getByRole("row").filter({ hasText: "I wash my face." })).toContainText("002-wash.webm");
  await expect(page.getByRole("button", { name: "음성 업로드 후 게시" })).toBeDisabled();

  await page.getByRole("button", { name: "초안 저장" }).click();
  await expect(page.getByRole("button", { name: "음성 업로드 후 게시" })).toBeEnabled();

  await page.getByLabel("문장별 음성 파일").setInputFiles([
    { name: "001-morning.mp3", mimeType: "audio/mpeg", buffer: Buffer.from([1]) },
    { name: "001-copy.webm", mimeType: "audio/webm", buffer: Buffer.from([2]) },
    { name: "002-wash.webm", mimeType: "audio/webm", buffer: Buffer.from([3]) }
  ]);
  await expect(page.getByText("1번 프레이즈의 음성 파일 번호가 중복됩니다.")).toBeVisible();
  await expect(page.getByRole("button", { name: "음성 업로드 후 게시" })).toBeDisabled();
});
