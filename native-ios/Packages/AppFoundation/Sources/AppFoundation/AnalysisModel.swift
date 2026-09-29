import Foundation
import Observation
import LearningReference

@MainActor @Observable public final class AnalysisModel {
    public enum State: Equatable, Sendable { case loading, ready, unavailable }
    public private(set) var state: State = .unavailable
    public private(set) var sentences: [AnalysisSentence] = []
    public private(set) var selectedSentenceID: String?
    public private(set) var selectedToken: Int?
    public var selectedSentence: AnalysisSentence? { sentences.first { $0.id == selectedSentenceID } }
    @ObservationIgnored private var generation = 0
    @ObservationIgnored private var pending: Task<[AnalysisSentence], any Error>?
    private let loader: @Sendable (AnalysisRequest) async throws -> [AnalysisSentence]
    private let isCurrent: @MainActor (AnalysisRequest) -> Bool
    public init(load: @escaping @Sendable (AnalysisRequest) async throws -> [AnalysisSentence],
                isCurrent: @escaping @MainActor (AnalysisRequest) -> Bool) {
        loader = load; self.isCurrent = isCurrent
    }
    public func load(_ request: AnalysisRequest) async {
        invalidate()
        guard isCurrent(request), !Task.isCancelled else { return }
        let token = generation
        state = .loading
        let task = Task { [loader] in try await loader(request) }
        pending = task
        do {
            let result = try await withTaskCancellationHandler { try await task.value } onCancel: { task.cancel() }
            guard generation == token else { return }
            guard isCurrent(request), !Task.isCancelled, !result.isEmpty else { invalidate(); return }
            pending = nil; sentences = result; state = .ready
        } catch {
            if generation == token { invalidate() }
        }
    }
    public func selectSentence(_ id: String?) {
        selectedSentenceID = sentences.contains { $0.id == id } ? id : nil
        selectedToken = nil
    }
    public func selectToken(_ index: Int?) {
        guard let index, let sentence = selectedSentence, sentence.tokens.indices.contains(index) else {
            selectedToken = nil; return
        }
        selectedToken = selectedToken == index ? nil : index
    }
    public func invalidate() {
        generation += 1; pending?.cancel(); pending = nil
        sentences = []; selectedSentenceID = nil; selectedToken = nil; state = .unavailable
    }
}
