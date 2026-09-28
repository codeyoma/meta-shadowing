import Foundation
import Testing
import LearningDomain
import LearningReference
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
    @Test func selectionAndReplacementStayScoped() async throws {
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
}
func referenceSentence() throws -> [AnalysisSentence] {
    let data = Data(#"{"schemaVersion":1,"complete":true,"encodingType":"UTF16","language":"en","entryCount":1,"entries":[{"phraseNumber":1,"text":"Hello","status":"complete","error":null,"analysis":{"language":"en","sentences":[{"text":{"content":"Hello","beginOffset":0}}],"tokens":[{"text":{"content":"Hello","beginOffset":0},"partOfSpeech":{"tag":"NOUN"},"dependencyEdge":{"headTokenIndex":0,"label":"ROOT"}}]}}]}"#.utf8)
    return try SentenceAnalysisReader.read(data, sources: [.init(index: 0, text: "Hello", translation: "안녕")], language: "en", sourceIndices: [0])
}
