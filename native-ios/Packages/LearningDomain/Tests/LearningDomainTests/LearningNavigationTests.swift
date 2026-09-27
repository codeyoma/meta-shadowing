import Testing
@testable import LearningDomain

struct LearningNavigationTests {
    @Test func navigationDoesNotConfirm() throws {
        let state = try step(startSession(count: 3), .selectSource(2))
        #expect(state.unit == 2 && state.current.confirmed == 0 && !state.running)
        #expect(state.sourceProgress.allSatisfy { $0.confirmed == 0 })
        #expect(throws: (any Error).self) { try step(state, .selectSource(3)) }
    }
    @Test func lastUnitReturnsToEarlierGap() throws {
        var state = try step(startSession(count: 3), .selectSource(2))
        for _ in 0..<2 { state = try step(ended(state), .confirm) }
        state = try step(ended(state), .next)
        #expect(state.phase == .ready && state.unit == 0)
        #expect(state.sourceProgress[2].confirmed == 3)
    }
}
