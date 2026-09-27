import Testing
@testable import LearningDomain

struct LearningTextTests {
    @Test(arguments: [
        ("Dr. Smith likes 3.5 apples. Hello!", "Dr … Hello …"),
        ("A. B. Smith. Isn't it nice?", "A … Isn't …"),
        ("こんにちは。今日は！", "こんにちは … 今日は …"),
        ("... ! ?", ""), ("안녕하세요. 잘 지내요?", "안녕하세요 … 잘 …")
    ]) func firstWordHintsPreserveSentenceRules(input: String, expected: String) {
        #expect(LearningText.firstWordHint(input) == expected)
    }
}
