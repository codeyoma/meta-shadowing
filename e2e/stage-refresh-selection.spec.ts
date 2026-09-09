import { expect, test } from "./fixtures/cloud-ui";
import { readServerJournal } from "./fixtures/cloud-navigation";

for (const [stage, groupSize] of [[7, 3], [8, 4]]) {
  test(`stage ${stage} remains selected when an account refresh finishes before Start`, async ({ page }) => {
    await page.request.post("/api/auth", { data: { password: "integration-beta-password" } });
    const profile = (await (await page.request.get("/api/learner/preferences")).json()).profile;
    expect((await page.request.patch("/api/learner/preferences", { data: {
      accountId: profile.accountId, revision: profile.revision, changes: { groupSize },
    } })).status()).toBe(200);
    await page.goto("/lessons/10000000-0000-4000-8000-000000000001/stages");
    const selected = page.getByRole("radio", { name: new RegExp(`^${stage} 다문장 암기`) });
    await expect(selected).toBeEnabled();
    await page.waitForLoadState("networkidle");
    let release!: () => void;
    const held = new Promise<void>(resolve => { release = resolve; });
    let requested!: () => void;
    const started = new Promise<void>(resolve => { requested = resolve; });
    await page.route("**/api/learner/preferences?*", async route => {
      requested();
      await held;
      await route.continue();
    });
    try {
      await page.evaluate(() => window.dispatchEvent(new Event("focus")));
      await started;
      await selected.click();
      await expect(selected).toHaveAttribute("aria-checked", "true");
    } finally { release(); }
    await page.waitForLoadState("networkidle");
    await expect(selected).toHaveAttribute("aria-checked", "true");
    await page.getByRole("dialog", { name: "다문장 암기", exact: true })
      .getByRole("button", { name: "학습 시작", exact: true }).click();
    await expect(page).toHaveURL(/level=4(?:&|$)/);
    await expect(page).toHaveURL(new RegExp(`stage=${stage}(?:&|$)`));
    await expect(page).toHaveURL(new RegExp(`group=${groupSize}(?:&|$)`));
    await expect(page.getByRole("button", { name: /^CONTINUE/ })).toBeVisible();
    expect((await readServerJournal(page)).progress).toMatchObject({
      level: 4, stage, settings: { groupSize }, nextPhrase: 0,
    });
  });
}
