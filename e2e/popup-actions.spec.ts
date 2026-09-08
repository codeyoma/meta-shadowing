import { openLearnerPage } from "./fixtures/cloud-navigation";
import { expect, test, type Locator, type Page } from "./fixtures/cloud-ui";
import { testRecording } from "./fixtures/audio";

async function bottomClose(page: Page, popup: Locator) {
  const close = popup.getByRole("button", { name: "닫기", exact: true });
  await expect(close).toBeInViewport({ ratio: 0.99 });
  await expect(close).toHaveCSS("background-color", "rgb(255, 75, 75)");
  const button = (await close.boundingBox())!;
  expect(page.viewportSize()!.height - button.y - button.height).toBeLessThanOrEqual(24);
  const panel = popup.locator('[data-slot="dialog-panel"]');
  const bounds = (await panel.boundingBox())!;
  expect(bounds.y + bounds.height).toBeLessThan(button.y);
  await expect(panel.getByRole("button", { name: "닫기", exact: true })).toHaveCount(0);
  expect(button.height).toBeGreaterThanOrEqual(44);
  await close.focus();
  await page.keyboard.press("Tab");
  expect(await popup.evaluate(element => element.contains(document.activeElement))).toBe(true);
  await close.click();
  await expect(popup).toHaveCount(0);
}

for (const [triggerName, popupName] of [["wake 뜻 보기", "wake 뜻"], ["문장 분석", "문장 분석"]])
test(`${popupName} closes from a fixed bottom Cardinal action and returns focus`, async ({ page }) => {
  await page.request.post("/api/auth", { data: { password: "integration-beta-password" } });
  await page.route("**/api/lessons/*/audio/*", route => route.fulfill({ contentType: "audio/webm", body: testRecording }));
  await page.route("**/api/dictionary?**", route => route.fulfill({ json: { word: "wake", entries: [{
    headword: "wake", language: "en", pos: "verb", tags: ["intransitive"],
    senses: Array.from({ length: 32 }, () => ({ glosses: ["길이가 긴 사전 설명입니다. ".repeat(8)] })),
    sourceUrl: "https://ko.wiktionary.org/wiki/wake", license: "CC BY-SA 4.0"
  }] } }));
  await page.route("**/syntax/*?**", route => route.fulfill({ json: { phraseNumber: 1, sentences: [] } }));
  await openLearnerPage(page, "/player?lesson=10000000-0000-4000-8000-000000000001&level=1");
  const trigger = page.getByRole("button", { name: triggerName, exact: true });
  for (const viewport of [{ width: 430, height: 932 }, { width: 320, height: 568 }, { width: 932, height: 430 }, { width: 568, height: 320 }, { width: 1280, height: 800 }]) {
    await page.setViewportSize(viewport);
    await trigger.click();
    const popup = page.getByRole("dialog", { name: popupName, exact: true });
    if (popupName === "wake 뜻") {
      const body = popup.locator('[aria-busy="false"]');
      await body.evaluate(element => { element.scrollTop = element.scrollHeight; });
      await popup.getByRole("button", { name: "출처 및 라이선스", exact: true }).click();
      if (viewport.height === 320) {
        const panel = popup.locator('[data-slot="dialog-panel"]');
        expect(await panel.evaluate(element => element.scrollHeight > element.clientHeight + 100)).toBe(true);
        await panel.evaluate(element => {
          const body = element.querySelector('[data-slot="dialog-scroll-body"]')!;
          element.scrollTop += body.getBoundingClientRect().top - element.getBoundingClientRect().top;
        });
        const visibleBodyHeight = await body.evaluate(element => {
          const panel = element.closest('[data-slot="dialog-panel"]')!.getBoundingClientRect();
          const body = element.getBoundingClientRect();
          return Math.min(panel.bottom, body.bottom) - Math.max(panel.top, body.top);
        });
        expect(visibleBodyHeight).toBeGreaterThan(100);
      }
    }
    await bottomClose(page, popup);
    await expect(trigger).toBeFocused();
    await trigger.click();
    await expect(popup).toBeVisible();
    await page.locator('[data-slot="dialog-overlay"]').click({ position: { x: 2, y: 2 } });
    await expect(popup).toHaveCount(0);
    await expect(trigger).toBeFocused();
  }
});

test("learning help uses a screen-bottom Cardinal close action", async ({ page }) => {
  await page.request.post("/api/auth", { data: { password: "integration-beta-password" } });
  await openLearnerPage(page, "/player?lesson=10000000-0000-4000-8000-000000000001&level=1");
  const trigger = page.getByRole("button", { name: "메타쉐도잉 레벨 1", exact: true });
  await trigger.click();
  const popup = page.getByRole("dialog", { name: "학습 방법", exact: true });
  await expect(popup.getByRole("button", { name: "닫기", exact: true })).toHaveCSS("background-color", "rgb(255, 75, 75)");
  await expect(popup.locator('[data-slot="dialog-panel"]').getByRole("button", { name: "닫기", exact: true })).toHaveCount(0);
  await popup.getByRole("button", { name: "닫기", exact: true }).click();
  await expect(popup).toHaveCount(0);
  await expect(trigger).toBeFocused();
});

test("stage preview keeps Start reachable with only its X close action", async ({ page }) => {
  await page.request.post("/api/auth", { data: { password: "integration-beta-password" } });
  await openLearnerPage(page, "/lessons/10000000-0000-4000-8000-000000000001/stages");
  for (const viewport of [{ width: 430, height: 932 }, { width: 932, height: 430 }, { width: 320, height: 568 }]) {
    await page.setViewportSize(viewport);
    const trigger = page.getByRole("radio", { name: /^2 자막 쉐도잉/ });
    await trigger.click();
    const popup = page.getByRole("dialog", { name: "자막 쉐도잉", exact: true });
    await expect(popup.getByRole("button", { name: "학습 시작", exact: true })).toBeInViewport({ ratio: 0.99 });
    await expect(popup.getByRole("button", { name: "세션 설정", exact: true })).toHaveCount(0);
    await expect(popup.getByRole("button", { name: "닫기", exact: true })).toHaveCount(0);
    await popup.getByRole("button", { name: "스테이지 안내 닫기", exact: true }).click();
    await expect(popup).toHaveCount(0);
    await expect(trigger).toBeFocused();
    await expect(page).toHaveURL(/\/stages$/);
  }
});
