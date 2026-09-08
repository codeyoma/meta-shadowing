import { expect, test, type Locator } from "@playwright/test";

test.beforeEach(async ({ page }) => {
  await page.request.post("/api/auth", { data: { password: "test-beta-password" } });
  await page.goto("/lessons/morning-routine/stages");
});

test("stage coins are flattened without distorting their icons and labels fit beside level badges", async ({ page }) => {
  for (const width of [430, 320]) {
    await page.setViewportSize({ width, height: 932 });
    await page.evaluate(() => document.fonts.ready);
    const stages = page.getByRole("list", { name: "학습 단계", exact: true }).getByRole("radio");
    await expect(stages).toHaveCount(16);
    const bounds = await page.getByRole("region", { name: "학습 단계 목록", exact: true }).boundingBox();
    for (const stage of await stages.all()) {
      const coin = stage.locator('[class*="levelNode"]');
      const coinBox = (await coin.boundingBox())!;
      const iconBox = (await coin.locator(":scope > svg").boundingBox())!;
      const badgeBox = (await stage.getByText(/^Lv \d$/).boundingBox())!;
      const nameBox = (await stage.locator("strong").boundingBox())!;
      expect(coinBox.width / coinBox.height).toBeGreaterThan(1.1);
      expect(coinBox.width / coinBox.height).toBeLessThan(1.25);
      expect(iconBox.width).toBeCloseTo(iconBox.height, 0);
      expect(coinBox.height).toBeGreaterThanOrEqual(44);
      expect(badgeBox.x + badgeBox.width).toBeLessThanOrEqual(nameBox.x);
      expect(Math.abs(badgeBox.y + badgeBox.height / 2 - nameBox.y - nameBox.height / 2)).toBeLessThanOrEqual(1);
      expect(badgeBox.x).toBeGreaterThanOrEqual(bounds!.x);
      expect(nameBox.x + nameBox.width).toBeLessThanOrEqual(bounds!.x + bounds!.width);
    }
    const highlight = await stages.first().locator('[class*="levelNode"]').evaluate(node => {
      const style = getComputedStyle(node, "::before");
      return { content: style.content, background: style.backgroundImage, pointerEvents: style.pointerEvents };
    });
    expect(highlight.content).not.toBe("none");
    expect(highlight.background).not.toBe("none");
    expect(highlight.pointerEvents).toBe("none");
  }
});

async function sampleEntrance(popup: Locator) {
  return popup.evaluate(node => {
    const animation = node.getAnimations().find(item => item instanceof CSSAnimation);
    if (!animation) return { start: 1, middle: 1, end: 1, duration: 0 };
    const duration = Number(animation.effect!.getTiming().duration);
    animation.pause();
    const scaleAt = (time: number) => {
      animation.currentTime = time;
      const transform = getComputedStyle(node).transform;
      return transform === "none" ? 1 : new DOMMatrixReadOnly(transform).a;
    };
    const result = { start: scaleAt(0), middle: scaleAt(duration / 2), end: scaleAt(duration), duration };
    animation.finish();
    return result;
  });
}

test("stage preview grows from 80 percent on every opening and restores keyboard focus", async ({ page }) => {
  const stage = page.getByRole("radio", { name: /^1 자막 쉐도잉/ });
  const popup = page.getByRole("dialog", { name: "자막 쉐도잉", exact: true });
  await stage.click();
  for (let opening = 0; opening < 2; opening++) {
    await expect(popup).toBeVisible();
    const motion = await sampleEntrance(popup);
    expect(motion.start).toBeCloseTo(0.8, 2);
    expect(motion.middle).toBeGreaterThan(0.8);
    expect(motion.middle).toBeLessThan(1);
    expect(motion.end).toBeCloseTo(1, 2);
    expect(motion.duration).toBeGreaterThanOrEqual(150);
    expect(motion.duration).toBeLessThanOrEqual(300);
    await page.keyboard.press("Escape");
    await expect(popup).toBeHidden();
    await expect(stage).toBeFocused();
    if (opening === 0) await page.keyboard.press("Enter");
  }
});

test("reduced motion opens the stage preview without scaling and keeps Start usable", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.getByRole("radio", { name: /^1 자막 쉐도잉/ }).click();
  const popup = page.getByRole("dialog", { name: "자막 쉐도잉", exact: true });
  await expect(popup).toBeVisible();
  const motion = await sampleEntrance(popup);
  expect(motion.start).toBe(1);
  expect(motion.end).toBe(1);
  await popup.getByRole("button", { name: "학습 시작", exact: true }).click();
  await expect(page).toHaveURL(/\/player\?.*stage=1(?:&|$)/);
});
