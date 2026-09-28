import LearningDomain
import Testing
@testable import MetaShadowingNative

@MainActor struct LearningGuideTests {
    @Test(arguments: 1...16) func instructionsMatchEachStage(_ stage: Int) throws {
        let guide = try LearningGuideContent(stage: stage)
        #expect((guide.grouping != nil) == (7...10).contains(stage))
        if (7...10).contains(stage) {
            #expect(guide.grouping?.contains("2–4개") == true)
            #expect(guide.grouping?.contains("확인한 학습은 유지") == true)
            #expect(guide.rewards.contains("새로 확인한 원본 구간 수"))
        }
        switch stage {
        case 5, 6, 9, 10:
            #expect(guide.practice.contains("첫 단어"))
            #expect(guide.practice.contains("번역은 항상"))
            #expect(guide.practice.contains("자막 보기"))
        case 11, 12: #expect(guide.practice.contains("원문 → 한국어"))
        case 13, 14: #expect(guide.practice.contains("한국어 → 원문"))
        case 15, 16: #expect(guide.practice.contains("원문은 나오지 않아요"))
        default:
            #expect(guide.practice.contains("자막과 번역"))
            #expect(!guide.practice.contains("첫 단어"))
        }
        if stage >= 11 {
            #expect(guide.practice.contains("음성 없이"))
            #expect(guide.practice.contains("S1–S4"))
            #expect(guide.confirmation.contains("한 번만"))
            #expect(!guide.confirmation.contains("두 번 더"))
            #expect(guide.rewards.contains("3 XP"))
        } else {
            #expect(guide.confirmation.contains("세 번"))
            #expect(guide.confirmation.contains("두 번 더"))
            if stage <= 6 { #expect(guide.rewards.contains("1 XP")) }
        }
    }

    @Test func invalidStagesDoNotInventInstructions() {
        for stage in [0, 17] {
            #expect(throws: LearningError.invalidPlan) { try LearningGuideContent(stage: stage) }
        }
    }
}
