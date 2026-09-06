import { expect, it } from "vitest";
import { firstPracticeToken } from "./practice-tokens";

it("honors supplied token boundaries, including Japanese phrases that a dictionary would split differently", () => {
  expect(firstPracticeToken("  私は 七時に 起きます。 ", "japanese")).toBe("私は");
  expect(firstPracticeToken("東京駅で　友達に会う。", "japanese")).toBe("東京駅で");
  expect(firstPracticeToken("I wake up at seven.", "english")).toBe("I");
  expect(firstPracticeToken("나는 일곱 시에 일어난다.", "korean")).toBe("나는");
  expect(firstPracticeToken("   ", "japanese")).toBe("");
});

it("automatically finds the first Japanese word only when no token spaces were provided", () => {
  expect(firstPracticeToken("私は七時に起きます。", "japanese")).toBe("私");
  expect(firstPracticeToken("「東京に行きます。」", "japanese")).toBe("東京");
  expect(firstPracticeToken("猫。", "japanese")).toBe("猫");
  expect(firstPracticeToken("Hello!", "english")).toBe("Hello!");
});
