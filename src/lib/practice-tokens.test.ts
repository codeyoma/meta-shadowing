import { expect, it } from "vitest";
import { firstPracticeToken, tokenizePracticeText } from "./practice-tokens";

it("uses supplied spaces as WPM boundaries without losing punctuation or inventing blank tokens", () => {
  expect(tokenizePracticeText("  I wake\tup at seven.  ", "english")).toEqual(["I", "wake", "up", "at", "seven."]);
  expect(tokenizePracticeText("私は 七時に　起きます。", "japanese")).toEqual(["私は", "七時に", "起きます。"]);
  expect(tokenizePracticeText("나는  일곱 시에 일어난다.", "korean")).toEqual(["나는", "일곱", "시에", "일어난다."]);
  expect(tokenizePracticeText("  ", "japanese")).toEqual([]);
});

it("segments unspaced Japanese into WPM words and keeps punctuation attached to the words", () => {
  expect(tokenizePracticeText("東京に行きます。", "japanese")).toEqual(["東京", "に", "行き", "ます。"]);
  expect(tokenizePracticeText("「猫。」", "japanese")).toEqual(["「猫。」"]);
  expect(tokenizePracticeText("…", "japanese")).toEqual(["…"]);
});

it("honors supplied token boundaries, including Japanese phrases that a dictionary would split differently", () => {
  expect(firstPracticeToken("  私は 七時に 起きます。 ", "japanese")).toBe("私は");
  expect(firstPracticeToken("東京駅で　友達に会う。", "japanese")).toBe("東京駅で");
  expect(firstPracticeToken("I wake up at seven.", "english")).toBe("I");
  expect(firstPracticeToken("나는 일곱 시에 일어난다.", "korean")).toBe("나는");
  expect(firstPracticeToken("   ", "japanese")).toBe("");
});

it("uses the same complete first token for hints and rapid practice, including Japanese punctuation", () => {
  expect(firstPracticeToken("私は七時に起きます。", "japanese")).toBe("私");
  expect(firstPracticeToken("「東京に行きます。」", "japanese")).toBe("「東京");
  expect(firstPracticeToken("猫。", "japanese")).toBe("猫。");
  expect(firstPracticeToken("…", "japanese")).toBe("…");
  expect(firstPracticeToken("Hello!", "english")).toBe("Hello!");
});

it("segments each Japanese dialogue line without mistaking line breaks for supplied word spaces", () => {
  expect(tokenizePracticeText("東京に行きます。\n「猫。」", "japanese")).toEqual(["東京", "に", "行き", "ます。", "「猫。」"]);
  expect(tokenizePracticeText("私は 七時に 起きます。\r\n東京に行きます。", "japanese")).toEqual(["私は", "七時に", "起きます。", "東京", "に", "行き", "ます。"]);
  expect(firstPracticeToken("東京に行きます。\n私は 七時に 起きます。", "japanese")).toBe("東京");
});

it("segments each unspaced Chinese dialogue line with the Chinese locale", () => {
  expect(tokenizePracticeText("我喜欢学习中文。\n今天天气很好。", "chinese")).toEqual([
    "我", "喜欢", "学习", "中文。", "今天", "天气", "很好。"
  ]);
  expect(firstPracticeToken("我喜欢学习中文。", "chinese")).toBe("我");
});
