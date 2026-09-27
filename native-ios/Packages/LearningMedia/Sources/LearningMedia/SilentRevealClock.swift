import Foundation
import LearningDomain

@MainActor public struct MediaClock {
    public let now: () -> Double
    public let sleep: (Double) async throws -> Void
    public init(now: @escaping () -> Double, sleep: @escaping (Double) async throws -> Void) { self.now = now; self.sleep = sleep }
    public static var live: Self { Self(now: { ProcessInfo.processInfo.systemUptime }, sleep: { try await Task.sleep(for: .seconds($0)) }) }
}

/// Sleeps only until the next visible word. No media player or periodic display timer.
@MainActor public final class SilentRevealClock {
    public var onEvent: (@MainActor (MediaTransportEvent) -> Void)?
    private let clock: MediaClock
    private var task: Task<Void, Never>?
    private var generation = UUID()
    private var startTime: Double?
    private var elapsed = 0.0, duration = 0.0
    public init(clock: MediaClock = .live) { self.clock = clock }
    public func start(token: TransportToken, elapsedSeconds: Double, duration: Double, WPM: Int) throws {
        cancel()
        guard elapsedSeconds.isFinite, elapsedSeconds >= 0, duration.isFinite, duration > 0, (1...999).contains(WPM) else { throw MediaFailure.invalidAsset }
        elapsed = min(elapsedSeconds, duration); self.duration = duration; startTime = clock.now()
        let current = generation
        task = Task { @MainActor [weak self] in
            guard let self else { return }
            do {
                let interval = 60 / Double(WPM)
                while current == self.generation, !Task.isCancelled {
                    let seconds = self.position()
                    if seconds >= duration {
                        self.elapsed = duration; self.startTime = nil; self.task = nil
                        self.onEvent?(.init(token: token, kind: .ended(.init(seconds: duration, duration: duration))))
                        return
                    }
                    let next = min(duration, (floor(seconds / interval + 1e-9) + 1) * interval)
                    try await self.clock.sleep(max(0, next - seconds))
                    guard current == self.generation, !Task.isCancelled else { return }
                    self.onEvent?(.init(token: token, kind: .position(.init(seconds: self.position(), duration: duration))))
                }
            } catch { }
        }
    }
    public func pause() -> Double {
        elapsed = position(); startTime = nil
        generation = UUID(); task?.cancel(); task = nil
        return elapsed
    }
    public func cancel() { _ = pause() }
    private func position() -> Double {
        min(duration, elapsed + max(0, startTime.map { clock.now() - $0 } ?? 0))
    }
}
