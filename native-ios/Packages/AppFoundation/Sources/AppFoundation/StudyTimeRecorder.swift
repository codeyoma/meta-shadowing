import Foundation
import LearningDomain
import Observation

public protocol StudyTimeClock: Sendable {
    func now() -> Duration
    func sleep(for duration: Duration) async throws
}

public struct MonotonicStudyTimeClock: StudyTimeClock {
    private let clock = ContinuousClock()
    private let origin: ContinuousClock.Instant
    public init() { origin = clock.now }
    public func now() -> Duration { origin.duration(to: clock.now) }
    public func sleep(for duration: Duration) async throws { try await clock.sleep(for: duration) }
}

/// Measures display dwell, never media duration or learning credit. Its owner supplies eligibility.
@MainActor @Observable public final class StudyTimeRecorder {
    public private(set) var saveFailed = false
    @ObservationIgnored private let clock: any StudyTimeClock
    @ObservationIgnored private let save: @Sendable (Int64) async throws -> StudyTimeReceipt
    @ObservationIgnored private let finish: @Sendable (Int64) async throws -> StudyTimeReceipt
    @ObservationIgnored private var total: Duration = .zero
    @ObservationIgnored private var anchor: Duration?
    @ObservationIgnored private var accepted: Int64 = 0
    @ObservationIgnored private var closing = false
    @ObservationIgnored private var closed = false
    @ObservationIgnored private var periodic: Task<Void, Never>?
    @ObservationIgnored private var periodicID = UUID()
    private struct Write { let id: UUID; let task: Task<StudyTimeReceipt, any Error> }
    @ObservationIgnored private var pending: Write?

    public init(clock: any StudyTimeClock = MonotonicStudyTimeClock(),
                save: @escaping @Sendable (Int64) async throws -> StudyTimeReceipt,
                finish: @escaping @Sendable (Int64) async throws -> StudyTimeReceipt) {
        self.clock = clock; self.save = save; self.finish = finish
    }
    public func setEligible(_ eligible: Bool) {
        guard !closed, !closing else { return }
        if eligible {
            if anchor == nil { anchor = clock.now() }
            startPeriodic()
        } else {
            sample(); anchor = nil; stopPeriodic()
        }
    }
    private func sample() {
        if let anchor {
            let now = clock.now()
            total += max(.zero, now - anchor)
            self.anchor = now
        }
    }
    private func amount() throws -> Int64 {
        sample()
        let c = total.components
        guard c.seconds >= 0, c.seconds <= StudyTimeCounter.maximumMilliseconds / 1_000 else { throw LearningError.invalidState }
        let result = c.seconds * 1_000 + c.attoseconds / 1_000_000_000_000_000
        guard result <= StudyTimeCounter.maximumMilliseconds else { throw LearningError.invalidState }
        return result
    }
    public func flush() async -> Bool { await perform(finishing: false) }
    public func retry() async -> Bool {
        let result = closing ? await close(discardUnsaved: false) : await flush()
        if result { startPeriodic() }
        return result
    }
    public func close(discardUnsaved: Bool) async -> Bool {
        if closed { return true }
        sample(); anchor = nil; closing = true; stopPeriodic()
        if discardUnsaved { closed = true; saveFailed = false; return true }
        if await perform(finishing: true) { closed = true; return true }
        return false
    }
    private func perform(finishing: Bool) async -> Bool {
        while let pending {
            if !(await settle(pending)) { return false }
        }
        if closed { return true }
        do {
            let target = try amount()
            if target <= accepted && !finishing { return true }
            let operation = finishing ? finish : save
            let write = Write(id: UUID(), task: Task { try await operation(target) })
            pending = write
            return await settle(write)
        } catch { saveFailed = true; return false }
    }
    private func settle(_ write: Write) async -> Bool {
        do {
            let receipt = try await write.task.value
            if pending?.id == write.id {
                pending = nil
                accepted = max(accepted, receipt.acceptedMilliseconds)
                saveFailed = false
            }
            return true
        } catch {
            if pending?.id == write.id { pending = nil; saveFailed = !closed }
            return false
        }
    }
    private func startPeriodic() {
        guard anchor != nil, periodic == nil, !saveFailed, !closing, !closed else { return }
        let id = UUID(), clock = clock
        periodicID = id
        periodic = Task { [weak self] in
            do {
                while !Task.isCancelled {
                    try await clock.sleep(for: .seconds(10))
                    guard !Task.isCancelled, let self, self.periodicID == id else { return }
                    if !(await self.flush()) { break }
                }
            } catch { }
            if let self, self.periodicID == id { self.periodic = nil }
        }
    }
    private func stopPeriodic() {
        periodicID = UUID(); periodic?.cancel(); periodic = nil
    }
}
