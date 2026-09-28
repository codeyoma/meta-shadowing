import Foundation
import Observation

@MainActor protocol DictionaryPresenting: AnyObject {
    func present(id: UUID, term: String, completion: @escaping @MainActor (Result<Void, any Error>) -> Void)
    func dismiss(id: UUID)
}
@MainActor @Observable final class DictionaryRequestOwner {
    private(set) var requestID: UUID?
    private(set) var failed = false
    var busy: Bool { requestID != nil }
    private let presenter: any DictionaryPresenting
    @ObservationIgnored private var presented = false
    @ObservationIgnored private var cancelled = false
    init(presenter: any DictionaryPresenting) { self.presenter = presenter }
    func lookup(term: String, permits: @escaping @MainActor () -> Bool,
                prepare: @MainActor () async -> Bool) async {
        guard !busy, permits(), DictionaryWords.ranges(term) == [NSRange(location: 0, length: term.utf16.count)] else { return }
        let id = UUID()
        requestID = id; failed = false; cancelled = false
        let ready = await prepare()
        guard requestID == id else { return }
        guard ready, !cancelled, !Task.isCancelled, permits() else { requestID = nil; return }
        presented = true
        presenter.present(id: id, term: term) { [weak self] result in
            guard let self, self.requestID == id else { return }
            if case .failure = result, !self.cancelled, permits() { self.failed = true }
            self.requestID = nil; self.presented = false
        }
    }
    func cancel() {
        cancelled = true; failed = false
        guard let id = requestID else { return }
        if presented { presenter.dismiss(id: id) }
        else { requestID = nil }
    }
}
