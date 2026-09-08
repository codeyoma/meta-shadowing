import { createClient } from "@supabase/supabase-js";
import { expect, test, lessonIds } from "./fixtures/cloud-ui";
import { openLearnerPage, readServerJournal } from "./fixtures/cloud-navigation";
import { assertLocalSupabaseUrl } from "./fixtures/local-supabase-google";

test("another lesson offers a route to the active practice before takeover", async ({ page, context }) => {
  const url = process.env.SUPABASE_INTEGRATION_URL!;
  assertLocalSupabaseUrl(url);
  const service = createClient(url, process.env.SUPABASE_INTEGRATION_SECRET_KEY!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  // Independently published lessons normally have different timestamps.
  expect((await service.from("lesson_drafts").update({ published_at: "2026-09-01T12:00:00Z" }).eq("id", lessonIds[1])).error).toBeNull();
  await page.request.post("/api/auth", { data: { password: "integration-beta-password" } });
  await openLearnerPage(page, `/player?lesson=${lessonIds[0]}&level=6&stage=11`);
  const other = await context.newPage();
  await other.goto(`/player?lesson=${lessonIds[1]}&level=6&stage=11`);
  await other.getByRole("link", { name: "진행 중인 학습으로 이동", exact: true }).click();
  await expect(other).toHaveURL(new RegExp(`lesson=${lessonIds[0]}`));
  await other.getByRole("button", { name: "이 기기에서 이어 학습", exact: true }).click();
  await expect(other.getByRole("dialog", { name: "학습 기기를 변경할까요?" })).toBeVisible();
  await other.getByRole("button", { name: "이어 학습 확인", exact: true }).click();
  await expect(other.getByRole("button", { name: /CONTINUE/ })).toBeEnabled();
  await other.close();
});

for (const level of [6, 7, 8]) test(`completed rapid level ${level} keeps settings read-only and can start a new run`, async ({ page }, testInfo) => {
  const errors: string[] = [];
  page.on("pageerror", error => errors.push(error.message));
  await page.request.post("/api/auth", { data: { password: "integration-beta-password" } });
  await openLearnerPage(page, `/player?lesson=${lessonIds[0]}&level=${level}&stage=${level * 2 - 1}&mode=automatic&wpm=6&speak=0&lineGap=0&sectionGap=0`);
  await page.getByRole("button", { name: /CONTINUE/ }).click();
  const completed = page.getByRole("heading", { name: `레벨 ${level} 학습 완료`, exact: true });
  await expect(completed).toBeVisible({ timeout: 20000 });
  const history = (await readServerJournal(page)).history;
  await page.getByRole("button", { name: "학습 메뉴", exact: true }).click();
  await page.getByRole("button", { name: "학습 설정", exact: true }).click();
  await expect(page.getByLabel("단어 속도")).toBeDisabled();
  await expect(page.getByRole("radio", { name: "자동", exact: true })).toBeDisabled();
  await page.screenshot({ path: testInfo.outputPath(`completed-settings-${level}.png`), animations: "disabled" });
  await page.keyboard.press("Escape");
  await expect(completed).toBeVisible();
  await expect(page.getByRole("alert", { name: "학습 저장 알림" })).toHaveCount(0);
  expect((await readServerJournal(page)).history).toEqual(history);
  await page.getByRole("button", { name: "학습 메뉴", exact: true }).click();
  await page.getByRole("button", { name: "문장 목록", exact: true }).click();
  await page.getByRole("button", { name: /^1번 문장/ }).click();
  await expect(page.getByRole("button", { name: /CONTINUE/ })).toBeEnabled();
  await expect(completed).toHaveCount(0);
  await page.getByRole("button", { name: "학습 메뉴", exact: true }).click();
  await page.getByRole("button", { name: "학습 설정", exact: true }).click();
  await expect(page.getByLabel("단어 속도")).toBeEnabled();
  expect(errors).toEqual([]);
});
