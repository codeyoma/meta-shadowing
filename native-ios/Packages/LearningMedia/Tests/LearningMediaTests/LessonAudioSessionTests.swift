import Testing
import LearningMedia

@MainActor final class AudioSessionFixture: AudioSessionHardware {
    var mode: LessonAudioMode?
    var active = false
    var gate: CheckedContinuation<Void, Never>?
    var suspendActivation = false
    func apply(_ mode: LessonAudioMode?) async throws {
        if mode != nil, suspendActivation { await withCheckedContinuation { gate = $0 } }
        self.mode = mode; active = mode != nil
    }
}

@MainActor struct LessonAudioSessionTests {
    @Test func invalidationKeepsRemoteOwnershipDormantUntilExplicitResume() async throws {
        let hardware = AudioSessionFixture()
        let session = LessonAudioSession(hardware: hardware)
        try await session.setRemoteOwnership(true)
        try await session.acquirePlayback()
        session.invalidate()
        session.releasePlayback(); session.releaseMonitoring()
        try await session.setRemoteOwnership(true)
        #expect(!hardware.active)
        try await session.acquirePlayback()
        #expect(hardware.active && hardware.mode == .playback)
        await session.shutdown()
        #expect(!hardware.active)
    }

    @Test func invalidationDuringActivationRejectsStalePlayback() async throws {
        let hardware = AudioSessionFixture()
        hardware.suspendActivation = true
        let session = LessonAudioSession(hardware: hardware)
        let request = Task { try await session.acquirePlayback() }
        try await eventually { hardware.gate != nil }
        session.invalidate()
        hardware.suspendActivation = false
        hardware.gate?.resume(); hardware.gate = nil
        await #expect(throws: MediaFailure.cancelled) { try await request.value }
        try await eventually { !hardware.active }
        try await session.acquirePlayback()
        #expect(hardware.active && hardware.mode == .playback)
        await session.shutdown()
    }

    @Test func invalidationDoesNotAutomaticallyRestoreMonitoring() async throws {
        let hardware = AudioSessionFixture()
        let session = LessonAudioSession(hardware: hardware)
        try await session.setRemoteOwnership(true)
        try await session.acquireMonitoring()
        session.invalidate()
        session.releaseMonitoring()
        try await session.setRemoteOwnership(true)
        #expect(!hardware.active)
        try await session.acquireMonitoring()
        #expect(hardware.active && hardware.mode == .monitoring)
        await session.shutdown()
    }

    @Test func playbackCleanupDoesNotDeactivateLiveMonitoring() async throws {
        let hardware = AudioSessionFixture()
        let session = LessonAudioSession(hardware: hardware)
        try await session.acquirePlayback()
        try await session.acquireMonitoring()
        session.releasePlayback()
        #expect(hardware.active)
        #expect(hardware.mode == .monitoring)
        try await session.acquirePlayback()
        session.releaseMonitoring()
        try await eventually { hardware.mode == .playback }
        #expect(hardware.active)
        #expect(hardware.mode == .playback)
        session.close(); session.close()
        try await eventually { !hardware.active }
        await #expect(throws: MediaFailure.cancelled) { try await session.acquireMonitoring() }
    }
    @Test func releaseDuringActivationCannotAcquireStalePlayback() async throws {
        let hardware = AudioSessionFixture(), session = LessonAudioSession(hardware: AudioSessionFixture())
        session.close()
        hardware.suspendActivation = true
        let owner = LessonAudioSession(hardware: hardware)
        let request = Task { try await owner.acquirePlayback() }
        try await eventually { hardware.gate != nil }
        owner.releasePlayback()
        hardware.gate?.resume(); hardware.gate = nil
        do { try await request.value; Issue.record("Retired activation succeeded") }
        catch { #expect(error as? MediaFailure == .cancelled) }
        try await eventually { !hardware.active }
        owner.close()
    }
}
