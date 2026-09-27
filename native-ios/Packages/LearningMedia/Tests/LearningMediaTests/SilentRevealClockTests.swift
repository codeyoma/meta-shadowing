import Foundation
import Testing
import LearningDomain
import LearningMedia

@MainActor struct SilentRevealClockTests {
    @Test func partialWordTimingSurvivesPause() throws {
        var now = 10.0
        let clock = SilentRevealClock(clock: MediaClock(now: { now }, sleep: { try await Task.sleep(for: .seconds($0)) }))
        let token = TransportToken(writerID: UUID(), planID: "reveal", unit: 0, cycle: 1, generation: UUID())
        try clock.start(token: token, elapsedSeconds: 0, duration: 0.8, WPM: 150)
        now = 10.2
        #expect(abs(clock.pause() - 0.2) < 0.00001)
        now = 100
        #expect(abs(clock.pause() - 0.2) < 0.00001)
        clock.cancel()
    }

    @Test func foregroundDoesNotAdvanceReveal() async throws {
        let f = try await MediaCoordinatorFixture(stage: 11)
        _ = await f.coordinator.perform(.resume)
        try await Task.sleep(for: .milliseconds(40))
        f.coordinator.setContext(.init(foreground: false))
        try await eventually { f.coordinator.state.controller.paused }
        let saved = f.coordinator.state.controller.snapshot.session.positionSeconds
        #expect(saved > 0 && saved < 0.4)
        try await Task.sleep(for: .milliseconds(100))
        f.coordinator.setContext(.init())
        #expect(f.coordinator.state.controller.snapshot.session.positionSeconds == saved)
        #expect(f.coordinator.state.controller.paused)
        await f.close()
    }

    @Test func completedRevealNeedsManualConfirmation() async throws {
        let f = try await MediaCoordinatorFixture(stage: 15)
        _ = await f.coordinator.perform(.resume)
        try await eventually { f.coordinator.state.controller.snapshot.session.phase == .speaking }
        #expect(f.coordinator.state.controller.snapshot.progress.xp == 0)
        #expect(f.coordinator.state.controller.snapshot.session.unit == 0)
        #expect(f.driver.request == nil)
        await f.close()
    }
}
