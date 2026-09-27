import Foundation
import Testing
@testable import LearningDomain

@Suite struct LearningRewardsTests {
    @Test func malformedRewardRunCannotDecodeIntoAnIndexingTrap() throws {
        let ledger = try RewardLedger().record(transition: LearningReducer.reduce(ended(startSession(count: 1)), event: .confirm), day: day)
        var raw = try BackupJSON.encoded(#require(ledger.runs.first)).object
        raw["candidates"] = .array([.object(["credited": .integer(0), "counts": .array([])])])
        #expect(throws: (any Error).self) { try JSONDecoder().decode(RewardRun.self, from: BackupJSON.object(raw).data()) }
        var mutated = try #require(ledger.runs.first)
        mutated.candidates[0].counts = []
        #expect(throws: LearningError.self) { try mutated.totalXP() }
    }
    let day = try! StudyDay("2026-09-27")

    @Test func sourceReceiptsCreditExactlyOnce() throws {
        let transition = try LearningReducer.reduce(ended(startSession(stage: 7, count: 5)), event: .confirm)
        let ledger = try RewardLedger().record(transition: transition, day: day)
        #expect(try ledger.totalXP(language: "english") == 2)
        #expect(try ledger.record(transition: transition, day: day) == ledger)
        #expect(try ledger.merged(with: ledger) == ledger)
        #expect(try ledger.totalXP(language: "japanese") == 0)
    }

    @Test func concurrentRegroupMergeConverges() throws {
        let first = try LearningReducer.reduce(ended(startSession(stage: 7, count: 5)), event: .confirm)
        let root = try RewardLedger().record(transition: first, day: day)
        func branch(_ size: Int) throws -> RewardLedger {
            let regroup = try LearningReducer.reduce(first.session, event: .regroup(size: size, newPlanID: "size-\(size)"))
            let base = try root.record(transition: regroup, day: day)
            let confirm = try LearningReducer.reduce(ended(regroup.session), event: .confirm)
            return try base.record(transition: confirm, day: day)
        }
        let a = try branch(3), b = try branch(4)
        let combined = try a.merged(with: b)
        #expect(try combined.totalXP(language: "english") == 6)
        #expect(try b.merged(with: a) == combined)
        #expect(try combined.merged(with: root) == root.merged(with: combined))
        #expect(try a.merged(with: b).merged(with: root) == a.merged(with: b.merged(with: root)))
    }

    @Test func newRunHasIndependentCredit() throws {
        let first = try LearningReducer.reduce(ended(startSession()), event: .confirm)
        let other = try LearningSession.start(plan: samplePlan(count: 1, run: "other"), preferences: .fresh)
        let second = try LearningReducer.reduce(ended(other), event: .confirm)
        let ledger = try RewardLedger().record(transition: first, day: day).record(transition: second, day: day)
        #expect(try ledger.totalXP(language: "english") == 2)
    }

    @Test func silentReceiptsUseThreeWithoutRepricingHistory() throws {
        let transition = try LearningReducer.reduce(ended(startSession(stage: 11)), event: .confirm)
        let new = try RewardLedger().record(transition: transition, day: day)
        #expect(try new.totalXP(language: "english") == 3)
        var historical = new.runs[0]
        historical.events = []
        historical.candidates = [CreditCandidate(credited: 1, counts: [1])]
        let old = try RewardLedger(runs: [historical])
        #expect(try old.totalXP(language: "english") == 1)
        #expect(try old.merged(with: new).totalXP(language: "english") == 3)
    }

    @Test func conflictingReceiptFailsAndDayUsesEarliestEvidence() throws {
        let transition = try LearningReducer.reduce(ended(startSession(stage: 7)), event: .confirm)
        let a = try RewardLedger().record(transition: transition, day: day)
        let b = try RewardLedger().record(transition: transition, day: StudyDay("2026-09-28"))
        #expect(try a.merged(with: b).runs[0].events[0].day == day)
        var conflicting = a.runs[0]
        conflicting.events[0].sources = [SourceOrdinal(source: 1, ordinal: 1)]
        conflicting.events[0].weight = 1
        #expect(throws: LearningError.self) { try a.merged(with: RewardLedger(runs: [conflicting])) }
    }

    @Test func opaqueHistoricalCreditAndLanguageCapSurviveMerge() throws {
        let transition = try LearningReducer.reduce(ended(startSession(stage: 7, count: 5)), event: .confirm)
        let base = try RewardLedger().record(transition: transition, day: day)
        var old = base.runs[0]
        old.events = []
        old.candidates = [CreditCandidate(credited: LevelProgress.maximumXP, counts: [1, 0, 0])]
        let historical = try RewardLedger(runs: [old])
        let regroup = try LearningReducer.reduce(transition.session, event: .regroup(size: 3, newPlanID: "child"))
        let child = try base.record(transition: regroup, day: day).record(
            transition: LearningReducer.reduce(ended(regroup.session), event: .confirm), day: day)
        #expect(try historical.merged(with: child).totalXP(language: "english") == LevelProgress.maximumXP)
        #expect(try historical.merged(with: child) == child.merged(with: historical))
    }

    @Test func malformedZeroObservedReceiptIsRejected() throws {
        let transition = try LearningReducer.reduce(ended(startSession()), event: .confirm)
        var run = try RewardLedger().record(transition: transition, day: day).runs[0]
        run.observed = [0]
        #expect(throws: LearningError.self) { try RewardLedger(runs: [run]) }
    }
}
