import Testing
import LearningMedia

@MainActor final class AudioSessionFixture: AudioSessionHardware {
    var mode: LessonAudioMode?
    var active = false
    func configure(_ mode: LessonAudioMode) throws { self.mode = mode }
    func activate() throws { active = true }
    func deactivate() { active = false }
}

@MainActor struct LessonAudioSessionTests {
    @Test func playbackCleanupDoesNotDeactivateLiveMonitoring() throws {
        let hardware = AudioSessionFixture()
        let session = LessonAudioSession(hardware: hardware)
        try session.acquirePlayback()
        try session.acquireMonitoring()
        session.releasePlayback()
        #expect(hardware.active)
        #expect(hardware.mode == .monitoring)
        try session.acquirePlayback()
        session.releaseMonitoring()
        #expect(hardware.active)
        #expect(hardware.mode == .playback)
        session.close(); session.close()
        #expect(!hardware.active)
        #expect(throws: MediaFailure.cancelled) { try session.acquireMonitoring() }
    }
}
