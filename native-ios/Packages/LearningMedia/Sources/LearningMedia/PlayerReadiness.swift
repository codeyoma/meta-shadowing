import AVFoundation

/// KVO and its bounded waiter have one owner. Cancellation resumes it exactly once.
@MainActor final class PlayerReadiness {
    private let item: AVPlayerItem
    private var observation: NSKeyValueObservation?
    private var continuation: CheckedContinuation<Void, any Error>?
    private var timeout: Task<Void, Never>?

    init(_ item: AVPlayerItem) { self.item = item }

    func wait() async throws {
        try Task.checkCancellation()
        try await withTaskCancellationHandler {
            try await withCheckedThrowingContinuation { continuation in
                self.continuation = continuation
                observation = item.observe(\.status, options: [.initial, .new]) { [weak self] _, _ in
                    Task { @MainActor in self?.check() }
                }
                timeout = Task { @MainActor [weak self] in
                    do { try await Task.sleep(for: .seconds(15)); self?.finish(.failure(MediaFailure.timedOut)) }
                    catch { }
                }
                if Task.isCancelled { cancel() }
            }
        } onCancel: {
            Task { @MainActor [weak self] in self?.cancel() }
        }
    }

    func cancel() { finish(.failure(MediaFailure.cancelled)) }
    private func check() {
        switch item.status {
        case .readyToPlay: finish(.success(()))
        case .failed: finish(.failure(MediaFailure.unavailable))
        default: break
        }
    }
    private func finish(_ result: Result<Void, any Error>) {
        guard let continuation else { return }
        self.continuation = nil
        observation?.invalidate(); observation = nil
        timeout?.cancel(); timeout = nil
        continuation.resume(with: result)
    }
}
