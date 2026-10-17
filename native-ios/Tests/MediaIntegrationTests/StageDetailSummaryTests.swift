import AppFoundation
import Foundation
import LearningDomain
import Testing
@testable import MetaShadowingNative

struct StageDetailSummaryTests {
    private func summary(runs: [Int: Int] = [:], latest: Int? = nil,
                         checkpoints: [Int: StageStudySummary] = [:], available: Bool = true) -> BookStudySummary {
        BookStudySummary(book: CatalogBook(id: "fixture-v1", book: "fixture", language: "english", title: "Fixture", sentenceCount: 5),
            completedRuns: runs, checkpoints: checkpoints, available: available, studyMilliseconds: 9_360_000,
            latestStage: latest, plannedUnitCounts: [1: 5, 7: 3])
    }
    private func checkpoint(stage: Int, group: Int = 1, source: Int = 0) throws -> StageStudySummary {
        let scope = try LearningScope(profileID: "test", packageKey: "fixture-v1", language: "english", book: "fixture", stage: stage)
        let plan = try LearningPlan.make(scope: scope, runID: "run", sources: (0..<5).map { .init(index: $0, text: "Word", translation: "단어") }, groupSize: max(2, group))
        var session = try LearningSession.start(plan: plan, preferences: .fresh)
        session = try LearningReducer.reduce(session, event: .selectSource(source)).session
        return StageStudySummary(session)
    }
    @Test func familiesPartitionSixteenStages() {
        #expect(StageFamily.allCases.map { $0.stages.count } == [6, 4, 6])
        #expect(StageFamily.allCases.flatMap(\.stages) == Array(1...16))
        #expect(StageFamily.containing(8) == .grouped)
        #expect(StageFamily.containing(12) == .crazySpeaking)
    }
    @Test func ringsRequireThreeRuns() {
        let value = StageDetailSummary(summary: summary(runs: [1: 1, 2: 2, 3: 3, 7: 4, 11: 3]), verifiedTestAccess: false)
        #expect(value.completedPercentage == 19)
        for family in StageFamily.allCases { #expect(value.completed(in: family) == 1) }
    }
    @Test func latestEligibleUnfinishedWins() throws {
        let value = StageDetailSummary(summary: summary(latest: 7, checkpoints: [7: try checkpoint(stage: 7, group: 2, source: 4)]), verifiedTestAccess: true)
        #expect(value.continuationStage == 7 && value.unit == 3 && value.unitCount == 3)
    }
    @Test func lockedOrMissingLatestFallsBackSafely() throws {
        let saved = try checkpoint(stage: 7, group: 2)
        let locked = StageDetailSummary(summary: summary(latest: 7, checkpoints: [7: saved]), verifiedTestAccess: false)
        #expect(locked.continuationStage == 1)
        let missing = StageDetailSummary(summary: summary(runs: [1: 3], latest: 7), verifiedTestAccess: false)
        #expect(missing.continuationStage == 2)
    }
    @Test func completedBookOffersReview() throws {
        let value = StageDetailSummary(summary: summary(runs: Dictionary(uniqueKeysWithValues: (1...16).map { ($0, 3) }),
            latest: 7, checkpoints: [7: try checkpoint(stage: 7, group: 2)]), verifiedTestAccess: false)
        #expect(value.isReview && value.continuationStage == 1 && value.completedPercentage == 100)
    }
    @Test func unfinishedFourthRunWinsWhileTheBookStillHasIncompleteStages() throws {
        let value = StageDetailSummary(summary: summary(runs: [1: 3], latest: 1,
            checkpoints: [1: try checkpoint(stage: 1, source: 3)]), verifiedTestAccess: false)
        #expect(!value.isReview && value.continuationStage == 1)
        #expect(value.unit == 4 && value.unitCount == 5)
        #expect(value.completedPercentage == 6)
    }
    @Test func groupedResumeUsesSavedUnitCount() throws {
        let value = StageDetailSummary(summary: summary(latest: 7, checkpoints: [7: try checkpoint(stage: 7, group: 3, source: 4)]), verifiedTestAccess: true)
        #expect(value.unitCount == 2 && value.unit == 2)
    }
    @Test func latestLockedCheckpointDoesNotHideAnOlderEligibleCheckpoint() throws {
        let base = summary(runs: [1: 3, 3: 3], latest: 7, checkpoints: [7: try checkpoint(stage: 7, group: 2), 4: try checkpoint(stage: 4, source: 3)])
        let ordered = BookStudySummary(book: base.book, completedRuns: base.completedRuns, checkpoints: base.checkpoints,
            available: true, plannedUnitCounts: base.plannedUnitCounts, recentStages: [7, 4])
        let value = StageDetailSummary(summary: ordered, verifiedTestAccess: false)
        #expect(value.continuationStage == 4 && value.unit == 4)
    }
    @Test func unavailableBookRetainsTimeButCannotLaunch() {
        let value = StageDetailSummary(summary: summary(available: false), verifiedTestAccess: true)
        #expect(value.continuationStage == nil)
        #expect(StudyTimeText(milliseconds: 9_360_000).compact == "2시간 36분")
    }
    @Test func durationFormattingDoesNotRoundUp() {
        for (time, text): (Int64, String) in [(0, "0분"), (59_999, "1분 미만"), (60_000, "1분"), (9_360_000, "2시간 36분")] {
            #expect(StudyTimeText(milliseconds: time).compact == text)
        }
        #expect(StudyTimeText(milliseconds: 1_500).accessibility.contains("1.5"))
    }
}
