import LearningDomain
import Observation

@MainActor @Observable
public final class AppBootstrap {
    public enum State: Equatable, Sendable {
        case idle, loading, ready(PreviewLibrary), failed
    }

    public private(set) var state: State = .idle
    private let load: @Sendable () async throws -> PreviewLibrary
    @ObservationIgnored private var generation = 0
    @ObservationIgnored private var pending: Task<PreviewLibrary, any Error>?

    public init(load: @escaping @Sendable () async throws -> PreviewLibrary) {
        self.load = load
    }

    public func activate() async {
        guard !Task.isCancelled else { return }
        switch state {
        case .ready, .loading: return
        case .idle, .failed: break
        }
        generation += 1
        let request = generation
        state = .loading
        let operation = Task { [load] in try await load() }
        pending = operation
        do {
            let library = try await withTaskCancellationHandler {
                try await operation.value
            } onCancel: {
                operation.cancel()
            }
            guard request == generation else { return }
            pending = nil
            guard !Task.isCancelled else { state = .idle; return }
            state = .ready(library)
        } catch {
            guard request == generation else { return }
            pending = nil
            state = Task.isCancelled || error is CancellationError ? .idle : .failed
        }
    }

    public func deactivate() {
        generation += 1
        pending?.cancel()
        pending = nil
        if state == .loading { state = .idle }
    }
}
