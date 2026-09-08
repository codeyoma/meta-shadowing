import { expect, test, type Page } from "@playwright/test";

const draftId = "44444444-4444-4444-8444-444444444444";
const initial = { configured: true, total: 3, complete: 0, pending: 3, processing: 0, failed: 0, estimatedUnits: 3, errors: [] as string[] };
async function importDraft(page: Page) {
  await page.request.post("/api/admin/auth/verify", { data: { email: "admin@example.com", token: "123456" } });
  await page.goto("/admin");
  await expect(page.locator('form[data-admin-ready="true"]')).toBeVisible();
  await page.getByLabel("레슨 제목").fill("Syntax example");
  await page.getByLabel("통합 스크립트", { exact: true }).setInputFiles({
    name: "syntax.txt", mimeType: "text/plain", buffer: Buffer.from("Hello. How are you?\n안녕하세요. 잘 지내세요?\n\nI am fine.\n잘 지내요.")
  });
  await page.getByRole("button", { name: "파일 검증", exact: true }).click();
  await page.route("**/api/admin/drafts", async route => {
    // Keep real parsing/validation; only make the fixture draft ID deterministic.
    const response = await route.fetch();
    const payload = await response.json();
    await route.fulfill({ response, json: { ...payload, draftId } });
  });
  await page.getByRole("button", { name: "초안 저장", exact: true }).click();
}

test("saving a draft automatically drains syntax batches and retries failures only on request", async ({ page }) => {
  let progress = { ...initial };
  let calls = 0;
  await page.route(`**/api/admin/drafts/${draftId}/syntax*`, async route => {
    const request = route.request();
    if (request.method() === "POST") {
      calls++;
      if (calls === 1) progress = { ...initial, complete: 2, pending: 0, failed: 1, errors: ["google-429"] };
      else {
        expect(new URL(request.url()).searchParams.get("retry")).toBe("failed");
        progress = { ...initial, complete: 3, pending: 0 };
      }
    }
    await route.fulfill({ json: progress });
  });
  await importDraft(page);
  const status = page.getByRole("region", { name: "문장 구문 분석", exact: true });
  await expect(status).toContainText("3문장 중 2문장 저장");
  await expect(status).toContainText("Google 요청 한도에 도달했습니다.");
  await status.getByRole("button", { name: "실패한 문장 다시 분석", exact: true }).click();
  await expect(status).toContainText("3문장 중 3문장 저장");
  await status.getByRole("button", { name: "상태 새로고침", exact: true }).click();
  await expect(status.getByRole("button", { name: "상태 새로고침", exact: true })).toBeEnabled();
  expect(calls).toBe(2);
});

test("a missing Google key leaves the saved draft pending and does not call the processor", async ({ page }) => {
  let calls = 0;
  await page.route(`**/api/admin/drafts/${draftId}/syntax*`, async route => {
    if (route.request().method() === "POST") calls++;
    await route.fulfill({ json: { ...initial, configured: false } });
  });
  await importDraft(page);
  const status = page.getByRole("region", { name: "문장 구문 분석", exact: true });
  await expect(status).toContainText("Google Cloud 인증 정보가 아직 설정되지 않았습니다.");
  await expect(page.getByText("초안이 저장되었습니다.", { exact: true })).toBeVisible();
  await status.getByRole("button", { name: "분석 시작 / 이어서 분석", exact: true }).click();
  await expect(status.getByRole("button", { name: "분석 시작 / 이어서 분석", exact: true })).toBeEnabled();
  expect(calls).toBe(0);
});
