import { expect, it } from "vitest";
import { dialogueTurns } from "./dialogue-turns";

it("pairs each quoted English turn with its Korean translation in source order", () => {
  expect(dialogueTurns({
    target: '"This is fake, isn\'t it?"\n"Hey, it\'s a genuine antique."\n"No way!"',
    korean: '"이거 가짜지, 그렇지?"\n"이봐, 진짜 골동품이라구."\n"설마!"'
  })).toEqual([
    { target: '"This is fake, isn\'t it?"', korean: '"이거 가짜지, 그렇지?"' },
    { target: '"Hey, it\'s a genuine antique."', korean: '"이봐, 진짜 골동품이라구."' },
    { target: '"No way!"', korean: '"설마!"' }
  ]);
});

it("accepts curly double quotes and trims source-line whitespace and CRLF", () => {
  expect(dialogueTurns({ target: '  “Hello.”\r\n“Hi.”  ', korean: ' “안녕.”\r\n“반가워.” ' })).toEqual([
    { target: '“Hello.”', korean: '“안녕.”' }, { target: '“Hi.”', korean: '“반가워.”' }
  ]);
});

it("pairs the four-turn takeaway dialogue despite mixed Korean quotation marks", () => {
  expect(dialogueTurns({
    target: '"Anything else?"\n"That\'s it."\n"For here or to go?"\n"To go."',
    korean: '"그밖에 더 필요하신 것은 없나요?”\n"그게 전부입니다."\n"여기서 드시겠습니까, 가지고 가시겠습니까?"\n"가지고 갈 겁니다."'
  })).toEqual([
    { target: '"Anything else?"', korean: '"그밖에 더 필요하신 것은 없나요?”' },
    { target: '"That\'s it."', korean: '"그게 전부입니다."' },
    { target: '"For here or to go?"', korean: '"여기서 드시겠습니까, 가지고 가시겠습니까?"' },
    { target: '"To go."', korean: '"가지고 갈 겁니다."' }
  ]);
});

it("uses quoted target lines as the dialogue signal without requiring quotes in translations", () => {
  expect(dialogueTurns({ target: '"Hello.”\n“Hi."', korean: '안녕.\n반가워.' })).toEqual([
    { target: '"Hello.”', korean: '안녕.' }, { target: '“Hi."', korean: '반가워.' }
  ]);
});

it.each([
  ['"Hello."', '"안녕."'],
  ['First line.\nSecond line.', '첫째 줄.\n둘째 줄.'],
  ['This is "fine."\n"Really?"', '"괜찮아."\n"정말?"'],
  ['"Hello."\n"Hi."', '"안녕."'],
  ['"Hello."\n"Hi."', '"안녕."\n"반가워."\n"잘 가."'],
  ['"Hello."\n\n"Hi."', '"안녕."\n"반가워."'],
  ['"Hello."\n"Hi."', '안녕.\n'],
  ['', '']
])("keeps ambiguous or unpaired text in its original single block: %s", (target, korean) => {
  expect(dialogueTurns({ target, korean })).toBeNull();
});
