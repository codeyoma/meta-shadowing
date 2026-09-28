import Foundation

public enum LessonAudioMode: Equatable, Sendable { case playback, monitoring }

@MainActor public protocol AudioSessionHardware: AnyObject {
    func apply(_ mode: LessonAudioMode?) async throws
}

/// Intent changes are synchronous; serialized OS transitions never block the UI executor.
@MainActor public final class LessonAudioSession {
    private let hardware: any AudioSessionHardware
    private var playback = false, monitoring = false, remote = false, closed = false
    private var playbackLease = UUID(), monitoringLease = UUID(), remoteLease = UUID()
    private var applied: LessonAudioMode?
    private var appliedKnown = true
    private var generation = UUID()
    private var activationSuspended = false
    private var tail: Task<Void, any Error>?
    public init(hardware: any AudioSessionHardware) { self.hardware = hardware }
    public func acquirePlayback() async throws {
        guard !closed else { throw MediaFailure.cancelled }
        activationSuspended = false
        let lease = UUID(); playbackLease = lease; playback = true
        do { try await enqueue().value } catch { if playbackLease == lease { releasePlayback() }; throw error }
        guard !closed, playback, playbackLease == lease else { throw MediaFailure.cancelled }
    }
    public func acquireMonitoring() async throws {
        guard !closed else { throw MediaFailure.cancelled }
        activationSuspended = false
        let lease = UUID(); monitoringLease = lease; monitoring = true
        do { try await enqueue().value } catch { if monitoringLease == lease { releaseMonitoring() }; throw error }
        guard !closed, monitoring, monitoringLease == lease else { throw MediaFailure.cancelled }
    }
    public func releasePlayback() { playbackLease = UUID(); playback = false; enqueue() }
    public func releaseMonitoring() { monitoringLease = UUID(); monitoring = false; enqueue() }
    public func setRemoteOwnership(_ owned: Bool) async throws {
        guard !closed else { throw MediaFailure.cancelled }
        let lease = UUID(); remoteLease = lease; remote = owned
        do { try await enqueue().value } catch {
            if remoteLease == lease { remote = false; enqueue() }; throw error
        }
        guard !closed, remoteLease == lease else { throw MediaFailure.cancelled }
    }
    /// OS interruptions invalidate cached state; retained remote intent cannot reactivate output.
    public func invalidate() {
        guard !closed else { return }
        generation = UUID(); appliedKnown = false; activationSuspended = true
        playbackLease = UUID(); monitoringLease = UUID()
        playback = false; monitoring = false
        enqueue()
    }
    public func close() {
        guard !closed else { return }
        closed = true; playback = false; monitoring = false; remote = false
        enqueue()
    }
    public func shutdown() async { close(); _ = try? await tail?.value }
    @discardableResult private func enqueue() -> Task<Void, any Error> {
        let previous = tail, current = generation
        let mode: LessonAudioMode? = activationSuspended ? nil : (monitoring ? .monitoring : (playback || remote ? .playback : nil))
        let operation = Task { @MainActor [self] in
            _ = try? await previous?.value
            guard current == generation else { throw MediaFailure.cancelled }
            guard !appliedKnown || applied != mode else { return }
            do {
                try await hardware.apply(mode)
                guard current == generation else { throw MediaFailure.cancelled }
                applied = mode; appliedKnown = true
            } catch { if current == generation { appliedKnown = false }; throw error }
        }
        tail = operation
        return operation
    }
}
