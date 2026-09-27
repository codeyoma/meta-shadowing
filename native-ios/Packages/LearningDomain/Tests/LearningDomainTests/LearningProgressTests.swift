import Foundation
import Testing
@testable import LearningDomain

@Suite struct LearningProgressTests {
    @Test func levelBoundariesMatchReference() throws {
        #expect(try LevelProgress.forXP(99).level == 1)
        #expect(try LevelProgress.forXP(100).level == 2)
        #expect(try LevelProgress.forXP(3_669_390).level == 999)
        #expect(try LevelProgress.forXP(Int64.max).maxLevel)
        #expect(throws: LearningError.self) { try LevelProgress.forXP(-1) }
        var boundary: Int64 = 0
        for level in 1...998 {
            boundary += Int64((10 * pow(1.0053, Double(level - 1))).rounded()) * 10
            #expect(try LevelProgress.forXP(boundary - 1).level == level)
            #expect(try LevelProgress.forXP(boundary).level == level + 1)
        }
    }

    @Test func streakUsesSuccessfulLocalSaveDay() throws {
        let days = try ["2026-09-25", "2026-09-26", "2026-09-28"].map(StudyDay.init)
        #expect(try StudyDay.streak(days: Set(days), today: StudyDay("2026-09-27")) == 2)
        #expect(try StudyDay.streak(days: Set(days), today: StudyDay("2026-09-28")) == 1)
        #expect(try StudyDay.streak(days: Set(days), today: StudyDay("2026-09-30")) == 0)
        var calendar = Calendar(identifier: .gregorian)
        calendar.timeZone = TimeZone(identifier: "America/Los_Angeles")!
        let instant = ISO8601DateFormatter().date(from: "2026-03-09T06:59:59Z")!
        #expect(try StudyDay.at(instant, calendar: calendar).rawValue == "2026-03-08")
        calendar.timeZone = TimeZone(secondsFromGMT: 9 * 3600)!
        #expect(try StudyDay.at(instant, calendar: calendar).rawValue == "2026-03-09")
        #expect(throws: LearningError.self) { try StudyDay("2026-02-30") }
    }

    @Test func threeFullRunsUnlockNextStage() throws {
        #expect(!StageProgress.canOpen(stage: 2, completedRuns: [1: 2], verifiedTestAccess: false))
        #expect(StageProgress.canOpen(stage: 2, completedRuns: [1: 3], verifiedTestAccess: false))
        #expect(StageProgress.canOpen(stage: 1, completedRuns: [:], verifiedTestAccess: false))
        #expect(StageProgress.canOpen(stage: 16, completedRuns: [:], verifiedTestAccess: true))
        #expect(!StageProgress.canOpen(stage: 17, completedRuns: [:], verifiedTestAccess: true))
    }
}
