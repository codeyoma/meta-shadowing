import { expect, test } from "@playwright/test";

test.beforeEach(async ({ page }) => {
  await page.request.post("/api/auth", { data: { password: "test-beta-password" } });
  await page.goto("/lessons/morning-routine/stages");
  await expect(page.getByRole("list", { name: "학습 단계", exact: true }).getByRole("radio").first()).toBeEnabled();
});

test("stage paths curve between coin centers with separated round dots at narrow and wide widths", async ({ page }) => {
  for (const width of [320, 430, 1440]) {
    await page.setViewportSize({ width, height: 932 });
    const geometry = await page.getByRole("list", { name: "학습 단계", exact: true }).evaluate(list => {
      const items = Array.from(list.children);
      return items.slice(0, -1).map((item, index) => {
        const connector = item.querySelector<SVGGeometryElement>('svg[class*="connector"] > :is(line, path)')!;
        const matrix = connector.getScreenCTM()!;
        const length = connector.getTotalLength();
        const sample = (fraction: number) => connector.getPointAtLength(length * fraction).matrixTransform(matrix);
        const start = sample(0);
        const end = sample(1);
        const center = (element: Element) => {
          const box = element.querySelector('[class*="levelNode"]')!.getBoundingClientRect();
          return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
        };
        const first = center(item);
        const second = center(items[index + 1]);
        const chord = Math.hypot(end.x - start.x, end.y - start.y);
        const bend = Math.max(...[.2, .4, .6, .8].map(fraction => {
          const point = sample(fraction);
          return Math.abs((end.x - start.x) * (start.y - point.y) - (start.x - point.x) * (end.y - start.y)) / chord;
        }));
        const style = getComputedStyle(connector);
        const label = item.querySelector('[class*="levelLabel"]')!.getBoundingClientRect();
        const crossesLabel = Array.from({ length: 51 }, (_, step) => sample(step / 50)).some(point =>
          point.x >= label.left - 3 && point.x <= label.right + 3 && point.y >= label.top - 3 && point.y <= label.bottom + 3
        );
        return {
          bend,
          crossesLabel,
          startDistance: Math.hypot(start.x - first.x, start.y - first.y),
          endDistance: Math.hypot(end.x - second.x, end.y - second.y),
          strokeWidth: parseFloat(style.strokeWidth),
          dashes: style.strokeDasharray === "none" ? [0, 0] : style.strokeDasharray.split(/[ ,]+/).map(parseFloat),
          linecap: style.strokeLinecap
        };
      });
    });
    expect(geometry).toHaveLength(15);
    for (const connector of geometry) {
      expect(connector.bend).toBeGreaterThan(8);
      expect(connector.crossesLabel).toBe(false);
      expect(connector.startDistance).toBeLessThan(1);
      expect(connector.endDistance).toBeLessThan(1);
      expect(connector.linecap).toBe("round");
      expect(connector.dashes[0]).toBeLessThanOrEqual(connector.strokeWidth);
      expect(connector.dashes[1]).toBeGreaterThan(connector.strokeWidth);
    }
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.screenshot({ path: test.info().outputPath(`stage-path-${width}.png`), animations: "disabled", scale: "css" });
  }
});

test("book title metadata has no empty header row and the stage label takes no visible space", async ({ page }) => {
  for (const width of [320, 430, 1440]) {
    await page.setViewportSize({ width, height: 932 });
    const summary = page.locator('[data-slot="card"]', { has: page.getByRole("heading", { level: 1 }) });
    const spacing = await summary.evaluate(card => {
      const header = card.querySelector('[data-slot="card-header"]')!;
      const content = card.querySelector('[data-slot="card-content"]')!;
      const childrenBottom = Math.max(...Array.from(header.children).map(child => child.getBoundingClientRect().bottom));
      return {
        emptyHeaderSpace: header.getBoundingClientRect().bottom - childrenBottom,
        contentGap: content.getBoundingClientRect().top - childrenBottom
      };
    });
    expect.soft(spacing.emptyHeaderSpace).toBeLessThanOrEqual(1);
    expect.soft(spacing.contentGap).toBeLessThanOrEqual(18);
    const label = page.getByText("학습 단계", { exact: true });
    if (await label.count()) {
      const box = (await label.boundingBox())!;
      expect.soft(box.height).toBeLessThanOrEqual(1);
      expect.soft(box.width).toBeLessThanOrEqual(1);
    }
    await expect(page.getByRole("list", { name: "학습 단계", exact: true })).toBeVisible();
  }
});

test("stage preview has only its X and Start controls and X returns focus", async ({ page }) => {
  const stage = page.getByRole("radio", { name: /^1 자막 쉐도잉/ });
  await stage.click();
  const preview = page.getByRole("dialog", { name: "자막 쉐도잉", exact: true });
  await expect(preview).toBeVisible();
  await expect(preview.getByRole("button")).toHaveCount(2);
  await expect(preview.getByRole("button", { name: "세션 설정", exact: true })).toHaveCount(0);
  await expect(preview.getByRole("button", { name: "학습 시작", exact: true })).toBeVisible();
  await page.screenshot({ path: test.info().outputPath("stage-preview.png"), animations: "disabled", scale: "css" });
  await preview.getByRole("button", { name: "스테이지 안내 닫기", exact: true }).click();
  await expect(preview).toBeHidden();
  await expect(stage).toBeFocused();
});
