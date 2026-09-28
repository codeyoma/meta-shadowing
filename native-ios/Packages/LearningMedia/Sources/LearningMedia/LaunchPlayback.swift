import Observation

/// Application readiness is independent: finishing this gate never reports bootstrap success.
@MainActor @Observable public final class LaunchPlayback {
    public enum Phase: Equatable, Sendable { case waiting, starting, playing, finished }
    public private(set) var phase: Phase = .waiting
    @ObservationIgnored public var onStart: (@MainActor () -> Void)?
    @ObservationIgnored public var onHaptics: (@MainActor () -> Void)?
    @ObservationIgnored public var onStop: (@MainActor () -> Void)?
    @ObservationIgnored private var timer: Task<Void, Never>?
    @ObservationIgnored private let clock: MediaClock
    @ObservationIgnored private var began = false
    public init(clock: MediaClock = .live) { self.clock = clock }
    public func begin(reduceMotion: Bool) {
        guard !began, phase == .waiting else { return }
        began = true
        if reduceMotion { interrupt(); return }
        arm(5)
    }
    public func startWhenReady(reduceMotion: Bool) {
        guard phase == .waiting else { return }
        if reduceMotion { interrupt(); return }
        if !began { begin(reduceMotion: false) }
        phase = .starting; onStart?()
    }
    /// Called by the native animation delegate, not asset decoding or view construction.
    public func animationDidBegin() {
        guard phase == .starting else { return }
        phase = .playing; onHaptics?(); arm(2.4)
    }
    public func interrupt() {
        guard phase != .finished else { return }
        timer?.cancel(); timer = nil; phase = .finished; onStop?()
    }
    private func arm(_ seconds: Double) {
        timer?.cancel()
        let clock = clock
        timer = Task { @MainActor [weak self] in
            guard !Task.isCancelled else { return }
            do { try await clock.sleep(seconds) } catch { return }
            guard !Task.isCancelled else { return }
            self?.interrupt()
        }
    }
}
