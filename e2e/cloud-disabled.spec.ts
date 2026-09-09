import { expect, test } from "@playwright/test";

test("disabled cloud learning stops entry and writes without reading or deleting legacy records", async ({ page }) => {
  await page.request.post("/api/auth", { data: { password: "test-beta-password" } });
  await page.addInitScript(() => {
    localStorage.setItem("meta-shadowing:learning:v1", "legacy-record-preserve");
    sessionStorage.setItem("meta-shadowing:preferences:v1", "legacy-settings-preserve");
  });
  for (const route of ["/languages", "/lessons", "/settings/session", "/lessons/morning-routine/stages", "/player?lesson=morning-routine&level=1"]) {
    await page.goto(route);
    await expect(page.getByRole("heading", { name: "계정 학습이 잠시 중지되었습니다." })).toBeVisible();
    await expect(page.getByRole("button", { name: /CONTINUE|학습 시작/ })).toHaveCount(0);
    await expect(page.getByRole("progressbar")).toHaveCount(0);
  }
  for (const path of ["/api/learner/preferences", "/api/learner/practice"]) {
    for (const method of ["GET", path.endsWith("preferences") ? "PATCH" : "POST"]) {
      const response = await page.request.fetch(path, { method, ...(method !== "GET" ? { data: {} } : {}) });
      expect(response.status()).toBe(503);
      expect(await response.json()).toEqual({ error: "learning-disabled" });
      expect(response.headers()["cache-control"]).toContain("no-store");
    }
  }
  expect(await page.evaluate(() => [localStorage.getItem("meta-shadowing:learning:v1"), sessionStorage.getItem("meta-shadowing:preferences:v1")]))
    .toEqual(["legacy-record-preserve", "legacy-settings-preserve"]);
});
