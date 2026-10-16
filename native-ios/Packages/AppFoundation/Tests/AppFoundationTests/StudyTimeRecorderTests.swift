import Foundation
import LearningDomain
import Synchronization
import Testing
@testable import AppFoundation

@MainActor @Suite struct StudyTimeRecorderTests {
    @Test func excludesToolsAndInactiveTimeWithoutDependingOnPlayback() async {
        let clock = ManualStudyClock(), sink = TimeSink()
        let recorder = makeRecorder(clock, sink)
        recorder.setEligible(true); clock.advance(.seconds(4))
        recorder.setEligible(true); clock.advance(.seconds(3))
        recorder.setEligible(false); clock.advance(.seconds(20))
        recorder.setEligible(true); clock.advance(.seconds(3))
        #expect(await recorder.close(discardUnsaved: false))
        #expect(await sink.amounts == [10_000])
    }

    @Test func shortIntervalsKeepFractionalMillisecondsAndCloseCannotRestart() async {
        let clock = ManualStudyClock(), sink = TimeSink(), recorder = makeRecorder(clock, sink)
        for _ in 0..<50 {
            recorder.setEligible(true); clock.advance(.microseconds(100)); recorder.setEligible(false)
        }
        #expect(await recorder.close(discardUnsaved: false))
        recorder.setEligible(true); clock.advance(.seconds(100))
        #expect(await recorder.flush())
        #expect(await sink.amounts == [5])
    }

    @Test func periodicCheckpointMeasuresElapsedTimeNotTimerTicks() async {
        let clock = ManualStudyClock(), sink = TimeSink(), recorder = makeRecorder(clock, sink)
        recorder.setEligible(true)
        for _ in 0..<1_000 { if clock.sleepers > 0 { break }; await Task.yield() }
        #expect(clock.sleepers == 1)
        clock.advance(.seconds(37))
        for _ in 0..<1_000 { if await sink.amounts == [37_000] { break }; await Task.yield() }
        #expect(await sink.amounts == [37_000])
        #expect(await recorder.close(discardUnsaved: false))
        #expect(await sink.amounts == [37_000, 37_000])
    }

    @Test func failedWriteRetainsTimeAndRetryUsesLatestCumulativeValue() async {
        let clock = ManualStudyClock(), sink = TimeSink(fail: true), recorder = makeRecorder(clock, sink)
        recorder.setEligible(true); clock.advance(.seconds(5))
        #expect(!(await recorder.flush()))
        #expect(recorder.saveFailed)
        clock.advance(.seconds(2))
        #expect(await recorder.retry())
        #expect(!recorder.saveFailed)
        #expect(await sink.amounts == [7_000])
        #expect(await recorder.close(discardUnsaved: false))
    }

    @Test func finalSaveWaitsForPendingWriteAndIncludesOnlyPreExitTime() async {
        let clock = ManualStudyClock(), sink = TimeSink(hold: true), recorder = makeRecorder(clock, sink)
        recorder.setEligible(true); clock.advance(.seconds(5))
        let pending = Task { await recorder.flush() }
        for _ in 0..<1_000 { if await sink.waiting { break }; await Task.yield() }
        #expect(await sink.waiting)
        clock.advance(.seconds(3))
        let closing = Task { await recorder.close(discardUnsaved: false) }
        await Task.yield()
        clock.advance(.seconds(50))
        await sink.release()
        #expect(await pending.value)
        #expect(await closing.value)
        #expect(await sink.amounts == [5_000, 8_000])
    }

    private func makeRecorder(_ clock: ManualStudyClock, _ sink: TimeSink) -> StudyTimeRecorder {
        StudyTimeRecorder(clock: clock, save: { try await sink.submit($0, final: false) },
                          finish: { try await sink.submit($0, final: true) })
    }
}

private actor TimeSink {
    var amounts: [Int64] = []
    private var fail: Bool
    private var hold: Bool
    private var gate: CheckedContinuation<Void, Never>?
    var waiting: Bool { gate != nil }
    init(fail: Bool = false, hold: Bool = false) { self.fail = fail; self.hold = hold }
    func release() { gate?.resume(); gate = nil }
    func submit(_ amount: Int64, final: Bool) async throws -> StudyTimeReceipt {
        if hold { hold = false; await withCheckedContinuation { gate = $0 } }
        if fail { fail = false; throw LearningStoreError.injectedFailure }
        amounts.append(amount)
        return StudyTimeReceipt(acceptedMilliseconds: amount, bookMilliseconds: amount,
                                backupRevision: Int64(amounts.count), retired: final)
    }
}

final class ManualStudyClock: StudyTimeClock, Sendable {
    private struct Waiter { let target: Duration; let continuation: CheckedContinuation<Void, any Error> }
    private struct State { var time: Duration = .zero; var waiters: [UUID: Waiter] = [:] }
    private let state = Mutex(State())
    var sleepers: Int { state.withLock { $0.waiters.count } }
    func now() -> Duration { state.withLock { $0.time } }
    func advance(_ duration: Duration) {
        let ready = state.withLock { value -> [CheckedContinuation<Void, any Error>] in
            value.time += duration
            let ready = value.waiters.filter { $0.value.target <= value.time }
            for key in ready.keys { value.waiters[key] = nil }
            return ready.values.map(\.continuation)
        }
        for continuation in ready { continuation.resume() }
    }
    func sleep(for duration: Duration) async throws {
        let id = UUID()
        try await withTaskCancellationHandler {
            try await withCheckedThrowingContinuation { (continuation: CheckedContinuation<Void, any Error>) in
                state.withLock {
                    if Task.isCancelled { continuation.resume(throwing: CancellationError()) }
                    else { $0.waiters[id] = Waiter(target: $0.time + duration, continuation: continuation) }
                }
            }
        } onCancel: {
            self.state.withLock { $0.waiters.removeValue(forKey: id) }?.continuation.resume(throwing: CancellationError())
        }
    }
}
