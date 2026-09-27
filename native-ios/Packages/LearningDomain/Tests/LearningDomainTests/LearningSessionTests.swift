import Foundation
import Testing
@testable import LearningDomain

func startSession(stage: Int = 1, count: Int = 1, size: Int = 2) throws -> LearningSession {
    try .start(plan: samplePlan(stage: stage, count: count, size: size), preferences: .fresh)
}
func step(_ state: LearningSession, _ event: LearningEvent) throws -> LearningSession {
    try LearningReducer.reduce(state, event: event).session
}
func ended(_ state: LearningSession) throws -> LearningSession {
    try step(step(state, .resume), .playbackEnded)
}

struct LearningSessionTests {
    @Test func endedPlaybackDoesNotAwardOrAdvance() throws {
        let state = try ended(startSession())
        #expect(state.phase == .speaking)
        #expect(state.current.confirmed == 0)
        #expect(state.unit == 0)
        #expect(try LearningReducer.reduce(state, event: .playbackEnded).confirmedSources.isEmpty)
    }
    @Test func thirdCycleChoicesWaitForPlaybackEnd() throws {
        var state = try startSession()
        for _ in 0..<2 { state = try step(ended(state), .confirm) }
        state = try step(state, .resume)
        #expect(state.showsThirdCycleChoices)
        #expect(!state.canRepeat && !state.canNext)
        #expect(try step(state, .next) == state)
        state = try step(state, .playbackEnded)
        #expect(state.canRepeat && state.canNext)
    }
    @Test func repeatAddsOnlyFourthAndFifthCycles() throws {
        var state = try startSession()
        for _ in 0..<2 { state = try step(ended(state), .confirm) }
        state = try step(ended(state), .repeat)
        #expect(state.current == UnitProgress(confirmed: 3, planned: 5))
        #expect(try step(state, .repeat) == state)
        state = try step(ended(state), .confirm)
        state = try step(ended(state), .next)
        #expect(state.phase == .complete)
        #expect(state.current.confirmed == 5)
    }
    @Test func nextConfirmsFinalCycleOnce() throws {
        var state = try startSession()
        for _ in 0..<2 { state = try step(ended(state), .confirm) }
        let result = try LearningReducer.reduce(ended(state), event: .next)
        #expect(result.confirmedSources == [SourceOrdinal(source: 0, ordinal: 3)])
        #expect(result.completed)
        #expect(try LearningReducer.reduce(result.session, event: .next).confirmedSources.isEmpty)
    }
    @Test func restoreIsPaused() throws {
        var state = try step(startSession(), .resume)
        state = try step(state, .position(1.25))
        let restored = try state.validatedForRestore(expected: state.plan.scope, sourceCount: 1)
        #expect(!restored.running && restored.positionSeconds == 1.25)
        #expect(try step(restored, .stageEntry).positionSeconds == 1.25)
        let speaking = try ended(startSession())
        #expect(try step(speaking.validatedForRestore(expected: speaking.plan.scope, sourceCount: 1), .stageEntry).phase == .listening)
        #expect(throws: (any Error).self) { try state.validatedForRestore(expected: state.plan.scope, sourceCount: 2) }
    }
    @Test func entryAndNavigationDelayButRepeatDoesNot() throws {
        let state = try startSession(count: 2)
        #expect(try LearningReducer.reduce(state, event: .stageEntry).intents.first?.delayMilliseconds == 1000)
        #expect(try LearningReducer.reduce(state, event: .resume).intents.first?.delayMilliseconds == 0)
        #expect(try LearningReducer.reduce(state, event: .selectSource(1)).intents == [.stop])
    }
    @Test func pausedSpeedEditPreservesPosition() throws {
        var state = try step(step(startSession(), .resume), .position(1.5))
        #expect(throws: (any Error).self) { try step(state, .changeRate(2)) }
        state = try step(state, .pause)
        let changed = try step(state, .changeRate(1.37))
        #expect(changed.rate == 1.37 && changed.positionSeconds == 1.5 && changed.current == state.current)
        for rate in [0, 3.1, Double.nan, .infinity] { #expect(throws: (any Error).self) { try step(state, .changeRate(rate)) } }
    }
    @Test func legacyLongPlansRequireExplicitConfirmation() throws {
        var state = try startSession()
        state.sourceProgress = [SourceProgress(confirmed: 6, planned: 7)]
        state = try ended(state)
        #expect(!state.canRepeat && !state.canNext)
        state = try step(state, .confirm)
        #expect(try step(state, .next).phase == .complete)
    }
}
