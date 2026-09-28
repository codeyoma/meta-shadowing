import Foundation
import LearningDomain
import Observation

public enum ProductLoadState: Equatable, Sendable {
    case idle, loading, ready(ProductSnapshot), failed(lastCommitted: ProductSnapshot?)
}

@MainActor @Observable public final class ProductModel {
    public private(set) var state: ProductLoadState = .idle
    public private(set) var snapshot: ProductSnapshot?
    public private(set) var busy = false
    public let workspace: ProductWorkspace
    @ObservationIgnored private var generation = 0
    @ObservationIgnored private var pending: Task<ProductSnapshot, any Error>?
    @ObservationIgnored private var retryOperation: Operation = .load
    private enum Operation {
        case load, select(String, String?), preferences(LearningPreferences)
    }
    public init(workspace: ProductWorkspace) { self.workspace = workspace }
    public var failed: Bool { if case .failed = state { true } else { false } }
    public var launchReady: Bool { if case .idle = state { false } else if case .loading = state { snapshot != nil } else { true } }

    public func activate() async { _ = await perform(.load) }
    public func select(language: String, packageKey: String?) async { _ = await perform(.select(language, packageKey)) }
    @discardableResult public func saveLearningPreferences(_ value: LearningPreferences) async -> Bool {
        await perform(.preferences(value))
    }
    public func retry() async { _ = await perform(retryOperation) }
    public func deactivate() {
        generation += 1; pending?.cancel(); pending = nil; busy = false
        if case .loading = state { state = snapshot.map(ProductLoadState.ready) ?? .idle }
    }
    private func perform(_ operation: Operation) async -> Bool {
        guard !busy, !Task.isCancelled else { return false }
        generation += 1
        let request = generation
        busy = true; retryOperation = operation
        if snapshot == nil { state = .loading }
        let task = Task { [workspace] in
            switch operation {
            case .load: try await workspace.load()
            case let .select(language, key): try await workspace.select(language: language, packageKey: key)
            case let .preferences(value): try await workspace.saveLearningPreferences(value)
            }
        }
        pending = task
        defer { if generation == request { busy = false; pending = nil } }
        do {
            let value = try await withTaskCancellationHandler { try await task.value } onCancel: { task.cancel() }
            guard generation == request, !Task.isCancelled else { return false }
            snapshot = value; state = .ready(value)
            return true
        } catch {
            guard generation == request else { return false }
            state = error is CancellationError ? (snapshot.map(ProductLoadState.ready) ?? .idle) : .failed(lastCommitted: snapshot)
            return false
        }
    }
}
