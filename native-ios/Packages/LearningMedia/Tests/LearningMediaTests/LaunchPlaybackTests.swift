import Testing
import LearningMedia

@MainActor private final class LaunchClock {
    var now = 0.0
    var waiters: [(Double, CheckedContinuation<Void, Never>)] = []
    var clock: MediaClock { .init(now: { self.now }, sleep: { seconds in
        await withCheckedContinuation { self.waiters.append((self.now + seconds, $0)) }
        try Task.checkCancellation()
    }) }
    func advance(_ seconds: Double) {
        now += seconds
        let ready = waiters.filter { $0.0 <= now }; waiters.removeAll { $0.0 <= now }
        ready.forEach { $0.1.resume() }
    }
    func releaseAll() { waiters.forEach { $0.1.resume() }; waiters.removeAll() }
}

@MainActor struct LaunchPlaybackTests {
    @Test func launchRunsOnceAfterBothImagesDisplay() async throws {
        let time = LaunchClock(), launch = LaunchPlayback()
        // Unready artwork must never begin from application readiness alone.
        #expect(launch.phase == .waiting)
        launch.interrupt()
        let playback = LaunchPlayback(clock: time.clock)
        var starts = 0, haptics = 0
        playback.onStart = { starts += 1 }
        playback.onHaptics = { haptics += 1 }
        playback.begin(reduceMotion: false)
        playback.startWhenReady(reduceMotion: false)
        #expect(starts == 1 && haptics == 0)
        playback.animationDidBegin()
        try await eventually { time.waiters.count == 1 }
        #expect(haptics == 1)
        time.advance(2.39)
        #expect(playback.phase == .playing)
        time.advance(0.01)
        try await eventually { playback.phase == .finished }
        playback.startWhenReady(reduceMotion: false); playback.animationDidBegin()
        #expect(starts == 1 && haptics == 1)
        time.releaseAll()
    }
    @Test func reduceMotionSkipsDelayAndHaptics() {
        let playback = LaunchPlayback()
        var started = false; playback.onStart = { started = true }
        playback.begin(reduceMotion: true); playback.startWhenReady(reduceMotion: true)
        #expect(playback.phase == .finished && !started)
    }
    @Test func inactivityCancelsWithoutReplay() {
        let playback = LaunchPlayback()
        playback.begin(reduceMotion: false); playback.startWhenReady(reduceMotion: false)
        playback.interrupt(); playback.animationDidBegin(); playback.startWhenReady(reduceMotion: false)
        #expect(playback.phase == .finished)
    }
    @Test func missingArtworkAllowsReadyAppAfterFiveSeconds() async throws {
        let time = LaunchClock(), playback = LaunchPlayback(clock: MediaClock.live)
        playback.interrupt()
        let pending = LaunchPlayback(clock: time.clock)
        pending.begin(reduceMotion: false)
        try await eventually { time.waiters.count == 1 }
        time.advance(5)
        try await eventually { pending.phase == .finished }
        pending.startWhenReady(reduceMotion: false)
        #expect(pending.phase == .finished)
        time.releaseAll()
    }
}
