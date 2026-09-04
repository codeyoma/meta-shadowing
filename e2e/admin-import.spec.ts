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
  await page.getByLabel("목표어 텍스트").setInputFiles({
    name: "target.txt",
    mimeType: "text/plain",
    buffer: Buffer.from("## Morning Routine\nおはよう ございます。\n\n顔を 洗います。\n")
  });
  await page.getByLabel("한국어 텍스트").setInputFiles({
    name: "ko.txt",
    mimeType: "text/plain",
    buffer: Buffer.from("## 아침 일과\n좋은 아침입니다.\n\n세수합니다.\n")
  });

  await page.getByRole("button", { name: "파일 검증" }).click();

  await expect(page.getByText("2개 프레이즈 · 1개 챕터 · 1개 구간 · 오류 없음")).toBeVisible();
  await expect(page.getByRole("cell", { name: /Morning Routine/ })).toBeVisible();
  await expect(page.getByRole("cell", { name: /아침 일과/ })).toBeVisible();
  await expect(page.getByRole("cell", { name: /おはよう ございます。/ })).toBeVisible();
  await expect(page.getByRole("cell", { name: /좋은 아침입니다\./ })).toBeVisible();

  await page.getByRole("button", { name: "초안 저장" }).click();
  await expect(page.getByRole("status")).toHaveText("초안이 저장되었습니다.");
});

test("a phrase-count mismatch remains blocked from publish-ready status", async ({ page }) => {
  await signInAsConfiguredAdministrator(page);

  await page.getByLabel("레슨 제목").fill("Morning Routine");
  await page.getByLabel("목표어 텍스트").setInputFiles({
    name: "target.txt",
    mimeType: "text/plain",
    buffer: Buffer.from("I wake up at seven.\nI wash my face.\n")
  });
  await page.getByLabel("한국어 텍스트").setInputFiles({
    name: "ko.txt",
    mimeType: "text/plain",
    buffer: Buffer.from("나는 일곱 시에 일어난다.\n")
  });

  await page.getByRole("button", { name: "파일 검증" }).click();

  await expect(
    page.getByRole("region", { name: "검증 미리보기" }).getByRole("alert")
  ).toContainText("프레이즈 수가 다릅니다");
  await expect(page.getByText("게시 준비 불가")).toBeVisible();
});

test("changing either source file clears a stale validation preview", async ({ page }) => {
  await signInAsConfiguredAdministrator(page);

  await page.getByLabel("레슨 제목").fill("Morning Routine");
  await page.getByLabel("목표어 텍스트").setInputFiles({
    name: "target.txt",
    mimeType: "text/plain",
    buffer: Buffer.from("Good morning.\n")
  });
  await page.getByLabel("한국어 텍스트").setInputFiles({
    name: "ko.txt",
    mimeType: "text/plain",
    buffer: Buffer.from("좋은 아침입니다.\n")
  });

  await page.getByRole("button", { name: "파일 검증" }).click();
  await expect(page.getByText("검증 완료")).toBeVisible();

  await page.getByLabel("목표어 텍스트").setInputFiles({
    name: "changed-target.txt",
    mimeType: "text/plain",
    buffer: Buffer.from("Good morning.\nHow are you?\n")
  });

  await expect(page.getByRole("region", { name: "검증 미리보기" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "초안 저장" })).toHaveCount(0);
});
