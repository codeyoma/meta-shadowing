import Testing
import AppFoundation

@Suite struct LearningRevealSpeedDraftTests {
    @Test(arguments: [
        ([150, 200, 250, 300], [150, 200, 250, 300]),
        ([160, 210, 260, 310], [150, 200, 250, 300]),
        ([1, 999, 1, 999], [100, 250, 300, 450]),
        ([200, 350, 500, 650], [200, 350, 500, 650])
    ])
    func legacyPresetsNormalizeOnlyForPresentation(_ input: ([Int], [Int])) {
        #expect(LearningRevealSpeedDraft.normalized(input.0) == input.1)
    }

    @Test(arguments: [
        ([150, 200, 250, 300], 0, 190, [200, 250, 300, 350]),
        ([150, 200, 250, 300], 0, 999, [200, 250, 300, 350]),
        ([150, 200, 250, 300], 1, 1, [150, 200, 250, 300]),
        ([150, 200, 250, 300], 1, 260, [150, 250, 300, 350]),
        ([150, 250, 400, 450], 0, 100, [100, 200, 350, 400]),
        ([150, 250, 400, 450], 2, 300, [150, 250, 300, 350]),
        ([160, 210, 260, 310], 3, 999, [150, 200, 250, 400])
    ])
    func editsSnapAndPreserveLaterIntervals(_ input: ([Int], Int, Int, [Int])) {
        #expect(LearningRevealSpeedDraft.changing(input.0, index: input.1, value: input.2) == input.3)
    }
}
