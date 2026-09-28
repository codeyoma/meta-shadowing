import Foundation
import Testing
import LearningDomain
import LearningPersistence
import LearningReference
import CryptoKit
@testable import AppFoundation

struct ProductAnalysisTests {
    @Test(arguments: ["source", "package"])
    func changedCatalogIdentityCannotReplacePinnedSources(_ field: String) async throws {
        let root = URL.temporaryDirectory.appending(path: UUID().uuidString)
        defer { try? FileManager.default.removeItem(at: root) }
        let catalog = ReferenceCatalog(root: root)
        let workspace = ProductWorkspace(store: SQLiteLearningStore(root: root.appending(path: "store")),
            catalog: catalog, profileID: "reference")
        let opened = try await workspace.openLesson(packageKey: "fixture-v1", stage: 1, verifiedTestAccess: false)
        await catalog.replace(field)
        await #expect(throws: AnalysisError.denied) {
            try await workspace.readAnalysis(AnalysisRequest(state: opened.initial))
        }
        #expect(await opened.controller.state == opened.initial)
        await opened.controller.deactivate()
    }
    @Test func validatesCurrentWriterAndRevocationDuringRead() async throws {
        let root = URL.temporaryDirectory.appending(path: UUID().uuidString)
        defer { try? FileManager.default.removeItem(at: root) }
        try FileManager.default.createDirectory(at: root, withIntermediateDirectories: true)
        let catalog = ReferenceCatalog(root: root)
        let workspace = ProductWorkspace(store: SQLiteLearningStore(root: root.appending(path: "store")), catalog: catalog, profileID: "reference")
        let opened = try await workspace.openLesson(packageKey: "fixture-v1", stage: 1, verifiedTestAccess: false)
        let request = AnalysisRequest(state: opened.initial)
        let result = try await workspace.readAnalysis(request)
        #expect(result.map(\.text) == ["Hello"])
        #expect(await opened.controller.state == opened.initial)
        await catalog.revokeOnRead()
        await #expect(throws: AnalysisError.denied) { try await workspace.readAnalysis(request) }
        await catalog.allow()
        await opened.controller.deactivate()
        await #expect(throws: AnalysisError.denied) { try await workspace.readAnalysis(request) }
    }
    @Test func absentSyntaxIsUnavailableWithoutChangingLearning() async throws {
        let root = URL.temporaryDirectory.appending(path: UUID().uuidString)
        defer { try? FileManager.default.removeItem(at: root) }
        let workspace = ProductWorkspace(store: SQLiteLearningStore(root: root),
            catalog: BundledProductCatalog(root: ProductCatalogTests.sampleRoot), profileID: "analysis-test")
        let opened = try await workspace.openLesson(packageKey: "morning-notes-v1", stage: 15, verifiedTestAccess: true)
        let request = AnalysisRequest(state: opened.initial)
        await #expect(throws: AnalysisError.unavailable) { try await workspace.readAnalysis(request) }
        #expect(await opened.controller.state == opened.initial)
        #expect(opened.initial.snapshot.progress.xp == 0)
        await opened.controller.deactivate()
    }
    @Test func anotherProfileCannotRead() async throws {
        let root = URL.temporaryDirectory.appending(path: UUID().uuidString)
        defer { try? FileManager.default.removeItem(at: root) }
        let store = SQLiteLearningStore(root: root)
        let catalog = BundledProductCatalog(root: ProductCatalogTests.sampleRoot)
        let first = ProductWorkspace(store: store, catalog: catalog, profileID: "first")
        let second = ProductWorkspace(store: store, catalog: catalog, profileID: "second")
        let opened = try await first.openLesson(packageKey: "morning-notes-v1", stage: 1, verifiedTestAccess: false)
        await #expect(throws: AnalysisError.denied) { try await second.readAnalysis(AnalysisRequest(state: opened.initial)) }
        await opened.controller.deactivate()
    }
}
private actor ReferenceCatalog: ProductCatalog {
    let root: URL
    var allowed = true
    var revokes = false
    var replacement = ""
    init(root: URL) { self.root = root }
    func revokeOnRead() { revokes = true }
    func allow() { allowed = true; revokes = false }
    func replace(_ field: String) { replacement = field }
    func books() -> [CatalogBook] {
        [.init(id: replacement == "package" ? "fixture-v2" : "fixture-v1", book: "fixture", language: "english", title: "Fixture", sentenceCount: 1)]
    }
    func materials(packageKey: String) -> BookMaterials {
        .init(book: books()[0], root: root,
            sources: [.init(index: 0, text: replacement == "source" ? "Changed" : "Hello", translation: "안녕")], media: [])
    }
    func permitsPractice(packageKey: String) -> Bool { allowed && packageKey == "fixture-v1" }
    func syntax(packageKey: String) throws -> InstalledSyntaxFile? {
        if revokes { allowed = false }
        let data = Data(#"{"schemaVersion":1,"complete":true,"encodingType":"UTF16","language":"en","entryCount":1,"entries":[{"phraseNumber":1,"text":"Hello","status":"complete","error":null,"analysis":{"language":"en","sentences":[{"text":{"content":"Hello","beginOffset":0}}],"tokens":[{"text":{"content":"Hello","beginOffset":0},"partOfSpeech":{"tag":"NOUN"},"dependencyEdge":{"headTokenIndex":0,"label":"ROOT"}}]}}]}"#.utf8)
        try data.write(to: root.appending(path: "syntax.json"))
        return .init(root: root, relativePath: "syntax.json", byteCount: data.count,
                     sha256: SHA256.hash(data: data).map { String(format: "%02x", $0) }.joined())
    }
}
