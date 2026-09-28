import Testing
import AppFoundation

@Suite struct LearningTypographyDraftTests {
    @Test(arguments: ["", "-", "11", "49", "20.5", "2e1"])
    func invalidSizeCannotReplaceSavedValue(_ draft: String) {
        #expect(LearningTypographyDraft.validSize(draft) == nil)
    }
    @Test(arguments: [("12", 12), ("20", 20), ("48", 48)])
    func validSizeIsAnInteger(_ input: (String, Int)) {
        #expect(LearningTypographyDraft.validSize(input.0) == input.1)
    }
}
