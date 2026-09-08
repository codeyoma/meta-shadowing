import { expect, it } from "vitest";
import { syntaxConnection, syntaxFeatures, syntaxPartLabel, syntaxRelationLabel, type SyntaxToken } from "./phrase-syntax";
const token: SyntaxToken = { text: { content: "passed", beginOffset: 0 }, lemma: "pass", partOfSpeech: { tag: "VERB", tense: "PAST", number: "NUMBER_UNKNOWN" }, dependencyEdge: { headTokenIndex: 0, label: "ROOT" } };
it("explains known morphological features without inventing meanings for unknown values", () => {
  expect(syntaxFeatures(token)).toEqual(["과거"]);
  expect(syntaxPartLabel("ADP", "en")).toBe("전치사");
  expect(syntaxPartLabel("ADP", "ja")).toBe("전치사·후치사");
  expect(syntaxPartLabel("NEW_TAG", "en")).toBe("품사 미분류");
});
it("does not label all root words as verbs", () => {
  expect(syntaxRelationLabel("ROOT")).toBe("문장의 중심");
  expect(syntaxConnection({ ...token, partOfSpeech: { tag: "NOUN" } }, [token])).toBe("이 문장의 중심으로 분석된 단어예요.");
});
it("resolves dependency heads against the sentence's original token indices", () => {
  const subject = { ...token, text: { content: "I", beginOffset: 0 }, dependencyEdge: { headTokenIndex: 1, label: "NSUBJ" } };
  expect(syntaxConnection(subject, [subject, token])).toBe("‘passed’에 ‘주어’ 관계로 연결돼요.");
  expect(syntaxRelationLabel("NEW_RELATION")).toBe("기타 관계 (NEW_RELATION)");
});
