import { openLearnerPage } from "./fixtures/cloud-navigation";
import { expect, test } from "./fixtures/cloud-ui";
import { testRecording } from "./fixtures/audio";

test("player header and screen-bottom modal actions stay usable without layout or runtime errors", async ({ page }, testInfo) => {
  const errors: string[] = [];
  page.on("pageerror", error => errors.push(error.message));
  page.on("console", message => {
    if (message.type() === "error" || message.type() === "warning") errors.push(message.text());
  });
  await page.setViewportSize(testInfo.project.name === "mobile" ? { width: 430, height: 932 } : { width: 1280, height: 800 });
  await page.request.post("/api/auth", { data: { password: "integration-beta-password" } });
  await page.route("**/api/lessons/*/audio/*", route => route.fulfill({ contentType: "audio/webm", body: testRecording }));
  await page.route("**/api/dictionary?**", route => route.fulfill({ json: { word: "wake", entries: [{
    headword: "wake", language: "en", pos: "verb", tags: ["intransitive"],
    senses: [{ glosses: ["잠에서 깨다. 일어나다."], examples: [{ text: "I wake up at seven.", translation: "나는 일곱 시에 일어난다." }] }],
    sourceUrl: "https://ko.wiktionary.org/wiki/wake", license: "CC BY-SA 4.0"
  }] } }));
  await page.route("**/syntax/*?**", route => route.fulfill({ json: { phraseNumber: 1, sentences: Array.from({ length: 12 }, (_, index) => ({
    sentenceNumber: index + 1, beginOffset: index * 20, text: "I wake up at seven.", language: "en", status: "complete", tokens: [
      { text: { content: "I", beginOffset: 0 }, lemma: "I", partOfSpeech: { tag: "PRON" }, dependencyEdge: { headTokenIndex: 1, label: "NSUBJ" } },
      { text: { content: "wake", beginOffset: 2 }, lemma: "wake", partOfSpeech: { tag: "VERB", tense: "PRESENT" }, dependencyEdge: { headTokenIndex: 1, label: "ROOT" } },
      { text: { content: "up", beginOffset: 7 }, lemma: "up", partOfSpeech: { tag: "PRT" }, dependencyEdge: { headTokenIndex: 1, label: "PRT" } }
    ]
  })) } }));
  await openLearnerPage(page, "/player?lesson=10000000-0000-4000-8000-000000000001&level=1");
  await expect(page).toHaveURL(url => url.pathname === "/player" && url.searchParams.get("lesson") === "10000000-0000-4000-8000-000000000001" && url.searchParams.get("level") === "1");
  await expect(page).toHaveTitle("Meta Shadowing");
  await expect(page.getByRole("region", { name: "학습 자막", exact: true })).toContainText("I wake up at seven.");
  const context = page.getByLabel("레슨 안내", { exact: true });
  const buttons = context.getByRole("button");
  await expect(buttons).toHaveCount(3);
  const boxes = await buttons.evaluateAll(elements => elements.map(element => {
    const { x, y, width, height } = element.getBoundingClientRect();
    return { x, y, width, height };
  }));
  for (let index = 1; index < boxes.length; index++) {
    expect(boxes[index].x).toBeGreaterThanOrEqual(boxes[index - 1].x + boxes[index - 1].width);
    expect(Math.abs(boxes[index].y + boxes[index].height / 2 - boxes[0].y - boxes[0].height / 2)).toBeLessThan(1);
  }
  await page.screenshot({ path: testInfo.outputPath("player-header.png"), scale: "css", animations: "disabled" });
  await page.getByRole("button", { name: "wake 뜻 보기", exact: true }).click();
  let popup = page.getByRole("dialog", { name: "wake 뜻", exact: true });
  await expect(popup).toContainText("잠에서 깨다.");
  const underlyingActions = page.locator('[role="group"][aria-label="학습 진행"]');
  await expect(underlyingActions).toBeHidden();
  await page.screenshot({ path: testInfo.outputPath("dictionary-screen-close.png"), scale: "css", animations: "disabled" });
  await popup.getByRole("button", { name: "확인", exact: true }).click();
  await expect(page.getByRole("button", { name: "wake 뜻 보기", exact: true })).toBeFocused();
  await expect(underlyingActions).toBeVisible();
  await context.getByRole("button", { name: "문장 분석", exact: true }).click();
  popup = page.getByRole("dialog", { name: "문장 분석", exact: true });
  await expect(popup.getByRole("article")).toHaveCount(12);
  await expect(underlyingActions).toBeHidden();
  await page.screenshot({ path: testInfo.outputPath("analysis-screen-close.png"), scale: "css", animations: "disabled" });
  const close = popup.getByRole("button", { name: "확인", exact: true });
  await close.click({ trial: true });
  const before = (await close.boundingBox())!;
  const body = popup.locator('[aria-busy="false"]');
  await body.evaluate(element => { element.scrollTop = element.scrollHeight; });
  expect(await body.evaluate(element => element.scrollTop)).toBeGreaterThan(0);
  expect((await close.boundingBox())!.y).toBe(before.y);
  await expect(popup.getByRole("article", { name: "문장 12", exact: true })).toBeInViewport();
  await page.setViewportSize({ width: 568, height: 320 });
  // Full-height drawers scroll their content while keeping the action reachable.
  await expect.poll(() => body.evaluate(element => element.scrollHeight > element.clientHeight)).toBe(true);
  const lastSentence = popup.getByRole("article", { name: "문장 12", exact: true });
  await lastSentence.scrollIntoViewIfNeeded();
  expect(await body.evaluate(element => element.scrollTop)).toBeGreaterThan(0);
  await expect(lastSentence).toBeInViewport();
  await expect(close).toBeInViewport({ ratio: 0.99 });
  await page.keyboard.press("Escape");
  await expect(popup).toHaveCount(0);
  await expect(context.getByRole("button", { name: "문장 분석", exact: true })).toBeFocused();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await expect(page.locator("nextjs-portal").getByText(/Runtime Error|Build Error|Hydration failed/)).toHaveCount(0);
  expect(errors).toEqual([]);
});
