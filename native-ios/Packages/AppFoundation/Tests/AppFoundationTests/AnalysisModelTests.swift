import Foundation
import Testing
import LearningDomain
import LearningReference
import LearningPersistence
@testable import AppFoundation

@MainActor struct AnalysisModelTests {
    @Test func cancellationRejectsLateResultAndClearsSelection() async throws {
        let root = URL.temporaryDirectory.appending(path: UUID().uuidString)
        defer { try? FileManager.default.removeItem(at: root) }
        let controller = try await SyntheticLearningWorkspace(root: root).open()
        let state = await controller.state
        let request = AnalysisRequest(state: state)
        let gate = AnalysisGate()
        let model = AnalysisModel(load: { _ in try await gate.read() }, isCurrent: { _ in true })
        let task = Task { await model.load(request) }
        await gate.waitUntilStarted()
        model.invalidate()
        await gate.finish(try referenceSentence())
        await task.value
        #expect(model.state == .unavailable)
        #expect(model.sentences.isEmpty)
        #expect(model.selectedToken == nil)
    }
    @Test func selectionAndInvalidationStayScoped() async throws {
        let root = URL.temporaryDirectory.appending(path: UUID().uuidString)
        defer { try? FileManager.default.removeItem(at: root) }
        let controller = try await SyntheticLearningWorkspace(root: root).open()
        let request = AnalysisRequest(state: await controller.state)
        let sentences = try referenceSentence()
        let model = AnalysisModel(load: { _ in sentences }, isCurrent: { _ in true })
        await model.load(request)
        #expect(model.state == .ready)
        model.selectSentence("1:0"); model.selectToken(0)
        #expect(model.selectedToken == 0)
        model.selectToken(0); #expect(model.selectedToken == nil)
        model.selectToken(99); #expect(model.selectedToken == nil)
        model.selectToken(0); model.invalidate()
        #expect(model.sentences.isEmpty)
        #expect(model.selectedSentenceID == nil)
        #expect((await controller.state).snapshot.progress.xp == 0)
    }
    @Test func invalidatedAuthorityRejectsCompletedLoad() async throws {
        let root = URL.temporaryDirectory.appending(path: UUID().uuidString)
        defer { try? FileManager.default.removeItem(at: root) }
        let controller = try await SyntheticLearningWorkspace(root: root).open()
        let request = AnalysisRequest(state: await controller.state)
        let gate = AnalysisGate()
        var allowed = true
        let model = AnalysisModel(load: { _ in try await gate.read() }, isCurrent: { _ in allowed })
        let task = Task { await model.load(request) }
        await gate.waitUntilStarted(); allowed = false
        await gate.finish(try referenceSentence()); await task.value
        #expect(model.state == .unavailable)
        #expect(model.sentences.isEmpty)
    }
    @Test(arguments: ["profile", "writer", "run", "package", "unit", "group"])
    func changedRequestIdentityRejectsSuspendedResult(_ change: String) async throws {
        let root = URL.temporaryDirectory.appending(path: UUID().uuidString)
        defer { try? FileManager.default.removeItem(at: root) }
        let writer = UUID()
        let original = try await analysisState(root: root.appending(path: "original"), writer: writer)
        let changed = try await analysisState(root: root.appending(path: "changed"), writer: change == "writer" ? UUID() : writer,
            profile: change == "profile" ? "other" : "test", package: change == "package" ? "sample-v2" : "sample-v1",
            run: change == "run" ? "new-run" : "run", group: change == "group" ? 3 : 2,
            unitChanged: change == "unit")
        var current = original
        let gate = AnalysisGate()
        let model = AnalysisModel(load: { _ in try await gate.read() }, isCurrent: { $0.matches(current) })
        let loading = Task { await model.load(AnalysisRequest(state: original)) }
        await gate.waitUntilStarted(); current = changed
        await gate.finish(try referenceSentence()); await loading.value
        #expect(model.state == .unavailable)
        #expect(model.sentences.isEmpty)
    }
    @Test func lateFailureCannotEraseNewerSuccessfulLoad() async throws {
        let root = URL.temporaryDirectory.appending(path: UUID().uuidString)
        defer { try? FileManager.default.removeItem(at: root) }
        let first = try await analysisState(root: root.appending(path: "first"), writer: UUID())
        let second = try await analysisState(root: root.appending(path: "second"), writer: UUID(), run: "new-run")
        var current = first
        let old = AnalysisGate(), fresh = AnalysisGate()
        let model = AnalysisModel(load: { request in
            if request.runID == "run" { return try await old.read() }
            return try await fresh.read()
        }, isCurrent: { $0.matches(current) })
        let firstLoad = Task { await model.load(AnalysisRequest(state: first)) }
        await old.waitUntilStarted(); current = second
        let secondLoad = Task { await model.load(AnalysisRequest(state: second)) }
        await fresh.waitUntilStarted(); await fresh.finish(try referenceSentence()); await secondLoad.value
        #expect(model.state == .ready)
        await old.fail(); await firstLoad.value
        #expect(model.state == .ready)
        #expect(model.sentences.map(\.text) == ["Hello"])
    }
}
private func analysisState(root: URL, writer: UUID, profile: String = "test", package: String = "sample-v1",
                           run: String = "run", group: Int = 2, unitChanged: Bool = false) async throws -> LearningControllerState {
    let store = SQLiteLearningStore(root: root)
    let scope = try LearningScope(profileID: profile, packageKey: package, language: "english", book: "sample", stage: 7)
    let plan = try LearningPlan.make(scope: scope, runID: run,
        sources: (0..<4).map { .init(index: $0, text: "Hello", translation: "안녕") }, groupSize: group)
    let initial = try await store.open(plan: plan, preferences: .fresh, writerID: writer)
    let controller = LearningController(store: store, snapshot: initial)
    if unitChanged {
        return await controller.send(.init(handle: initial.handle, id: UUID(), expectedVersion: initial.writerVersion, event: .selectSource(2)))
    }
    return await controller.state
}
private actor AnalysisGate {
    var pending: CheckedContinuation<[AnalysisSentence], any Error>?
    var started: CheckedContinuation<Void, Never>?
    func read() async throws -> [AnalysisSentence] {
        try await withCheckedThrowingContinuation { pending = $0; started?.resume(); started = nil }
    }
    func waitUntilStarted() async {
        if pending != nil { return }
        await withCheckedContinuation { started = $0 }
    }
    func finish(_ result: [AnalysisSentence]) { pending?.resume(returning: result); pending = nil }
    func fail() { pending?.resume(throwing: AnalysisError.unavailable); pending = nil }
}
func referenceSentence() throws -> [AnalysisSentence] {
    let data = Data(#"{"schemaVersion":1,"complete":true,"encodingType":"UTF16","language":"en","entryCount":1,"entries":[{"phraseNumber":1,"text":"Hello","status":"complete","error":null,"analysis":{"language":"en","sentences":[{"text":{"content":"Hello","beginOffset":0}}],"tokens":[{"text":{"content":"Hello","beginOffset":0},"partOfSpeech":{"tag":"NOUN"},"dependencyEdge":{"headTokenIndex":0,"label":"ROOT"}}]}}]}"#.utf8)
    return try SentenceAnalysisReader.read(data, sources: [.init(index: 0, text: "Hello", translation: "안녕")], language: "en", sourceIndices: [0])
}
