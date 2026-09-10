import { reloadLearnerPage, openLearnerPage } from "./fixtures/cloud-navigation";
import { seedLearningJournal } from "./fixtures/cloud-journal";
import { expect, test } from "./fixtures/cloud-ui";
import { lessons } from "./fixtures/cloud-ui";
import { DEFAULT_SESSION_SETTINGS } from "../src/lib/session-settings";

test("lesson totals and each card reflect unique completed stages of the current version", async ({ page }) => {
  await page.request.post("/api/auth", { data: { password: "integration-beta-password" } });
  await openLearnerPage(page, "/lessons?language=english");
  const summary = page.getByRole("progressbar", { name: "레슨 학습 진척도", exact: true });
  const first = page.getByRole("progressbar", { name: "Morning Routine 스테이지 진척도", exact: true });
  const second = page.getByRole("progressbar", { name: "Daily Conversation 스테이지 진척도", exact: true });
  await expect(page.getByRole("region", { name: "레슨 목록", exact: true }).getByText("완료한 레슨", { exact: true })).toBeVisible();
  await expect(summary).toHaveAttribute("aria-valuenow", "0");
  await expect(summary).toHaveAttribute("aria-valuemax", "2");
  await expect(first).toHaveAttribute("aria-valuenow", "0");
  await expect(second).toHaveAttribute("aria-valuemax", "16");
  const complete = (lessonIndex: number, stage: number, version = "fixture-v1") => {
    const lesson = lessons[lessonIndex];
    return { runId: `${lesson.id}-${version}-${stage}`, lessonId: lesson.id, lessonVersion: version,
      lessonName: lesson.name, language: lesson.language, stage, level: Math.ceil(stage / 2),
      nextPhrase: 3, nextUnit: 3, activeMs: 1000, settings: DEFAULT_SESSION_SETTINGS,
      completedAt: "2026-09-08T00:00:00Z" };
  };
  const history = [
    ...Array.from({ length: 16 }, (_, index) => complete(0, index + 1)),
    ...Array.from({ length: 15 }, (_, index) => complete(1, index + 1)),
    { ...complete(1, 1), runId: "replay" }, complete(1, 16, "2026-08-01T00:00:00Z"),
    ...Array.from({ length: 16 }, (_, index) => complete(2, index + 1)),
  ];
  await seedLearningJournal(page, { progress: null, history });
  await reloadLearnerPage(page);
  await expect(summary).toHaveAttribute("aria-valuenow", "1");
  await expect(summary).toHaveAttribute("aria-valuemax", "2");
  await expect(first).toHaveAttribute("aria-valuenow", "16");
  await expect(second).toHaveAttribute("aria-valuenow", "15");
  const card = page.getByRole("link").filter({ has: second });
  await expect(card).toContainText("15 / 16");
  const progressBox = (await second.boundingBox())!;
  const countBox = (await card.getByText("15 / 16", { exact: true }).boundingBox())!;
  expect(countBox.x).toBeGreaterThan(progressBox.x + progressBox.width);
  expect(countBox.y + countBox.height / 2).toBeCloseTo(progressBox.y + progressBox.height / 2, 0);
  await expect(card).toContainText("스테이지 16 이어서 학습");
  const text = card.getByText("스테이지 16 이어서 학습", { exact: true });
  expect((await second.boundingBox())!.y).toBeGreaterThan((await text.boundingBox())!.y);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth && scrollY === 0)).toBe(true);
  await page.screenshot({ path: test.info().outputPath("lesson-progress-inline.png"), animations: "disabled", scale: "css" });
});
