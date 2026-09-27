import Testing
@testable import LearningDomain

struct LearningRegroupingTests {
    @Test(arguments: [2, 3, 4]) func regroupPreservesSourceOrdinalsAcrossEverySize(size: Int) throws {
        var state = try startSession(stage: 7, count: 5, size: size)
        state = try step(ended(state), .confirm)
        for newSize in [2, 3, 4] where newSize != size {
            let changed = try LearningRegrouping.apply(state, size: newSize, newPlanID: "new-\(newSize)")
            #expect(changed.sourceProgress.map(\.confirmed) == state.sourceProgress.map(\.confirmed))
            #expect(changed.plan.lineage == "run" && changed.plan.groupSize == newSize)
            #expect(!changed.running && changed.positionSeconds == 0)
        }
    }
    @Test func closedSourcesNeverReopenOnRepeat() throws {
        var state = try startSession(stage: 7, count: 3)
        for _ in 0..<3 { state = try step(ended(state), .confirm) }
        state = try LearningRegrouping.apply(state, size: 3, newPlanID: "regroup")
        for _ in 0..<2 { state = try step(ended(state), .confirm) }
        let change = try LearningReducer.reduce(ended(state), event: .repeat)
        #expect(change.confirmedSources == [SourceOrdinal(source: 2, ordinal: 3)])
        #expect(change.session.sourceProgress.map(\.planned) == [3, 3, 5])
        #expect(change.session.sourceProgress.map(\.closed) == [true, true, false])
    }
    @Test func regroupRequiresPausedNewIdentity() throws {
        let state = try startSession(stage: 7)
        #expect(throws: (any Error).self) { try LearningRegrouping.apply(step(state, .resume), size: 3, newPlanID: "new") }
        #expect(throws: (any Error).self) { try LearningRegrouping.apply(state, size: 3, newPlanID: "run") }
        #expect(try LearningRegrouping.apply(state, size: 2, newPlanID: "unused") == state)
    }
}
