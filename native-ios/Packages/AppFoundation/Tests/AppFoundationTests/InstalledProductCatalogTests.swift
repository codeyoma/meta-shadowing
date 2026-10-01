import AppleServices
import CryptoKit
import Foundation
import LearningReference
import LearningPersistence
import LearningDomain
import Testing
@testable import AppFoundation

struct InstalledProductCatalogTests {
    @Test func offlineInstalledPackageReopenPreservesCheckpointCreditAndPreferences() async throws {
        let root = URL.temporaryDirectory.appendingPathComponent(UUID().uuidString)
        defer { try? FileManager.default.removeItem(at: root) }
        let audio = Data("abc".utf8)
        let manifest = Data(#"{"id":"morning-notes","version":1,"title":"Sample","phrases":[{"text":"Hello","translation":"안녕","file":"audio/one.m4a","bytes":3,"sha256":"ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad"}]}"#.utf8)
        let files = ["manifest.json": manifest, "audio/one.m4a": audio]
        let descriptor = DeliveryPackage(key: "hosted-morning-notes-v1", files: files.map {
            .init(file: $0.key, bytes: $0.value.count, sha256: SHA256.hash(data: $0.value).map { String(format: "%02x", $0) }.joined())
        })
        let package = HostedPackage(descriptor: descriptor, assetPackID: nil)
        let book = CatalogBook(id: descriptor.key, book: "hosted-morning-notes", language: "english", title: "Sample", sentenceCount: 1)
        let contentRoot = root.appendingPathComponent("content"), learningRoot = root.appendingPathComponent("learning")
        let delivery = try ContentDelivery(root: contentRoot, packages: [package], transport: { _ in CatalogAssets(files: files) })
        try await delivery.download(packageKey: book.id)
        let store = SQLiteLearningStore(root: learningRoot)
        var preferences = ProfilePreferences(libraryBook: book.book, libraryPackageKey: book.id)
        preferences.learning.rate = 1.5
        _ = try await store.savePreferences(preferences, profileID: "local")
        let catalog = InstalledProductCatalog(bundled: EmptyInstalledCatalog(), delivery: delivery, listings: [book])
        let workspace = ProductWorkspace(store: store, catalog: catalog, profileID: "local")
        let lesson = try await workspace.openLesson(packageKey: book.id, stage: 1, verifiedTestAccess: false)
        let running = await lesson.controller.send(command(lesson.initial.snapshot, .resume))
        let token = try #require(running.requests.first).token
        let ended = await lesson.controller.receive(LearningCallback(token: token, event: .playbackEnded))
        let confirmed = await lesson.controller.send(command(ended.snapshot, .confirm))
        let paused = await lesson.controller.send(command(confirmed.snapshot, .pause))
        #expect(paused.snapshot.progress.xp == 1)
        #expect(paused.snapshot.session.current.confirmed == 1)
        let expected = try await workspace.load()
        let saved = try await store.readCheckpoint(plan: paused.snapshot.session.plan)
        await lesson.controller.deactivate()

        let coldDelivery = try ContentDelivery(root: contentRoot, packages: [package], transport: { _ in nil })
        let coldCatalog = InstalledProductCatalog(bundled: EmptyInstalledCatalog(), delivery: coldDelivery, listings: [book])
        let coldStore = SQLiteLearningStore(root: learningRoot)
        let coldWorkspace = ProductWorkspace(store: coldStore, catalog: coldCatalog, profileID: "local")
        #expect(await coldCatalog.permitsPractice(packageKey: book.id))
        #expect(try await coldStore.preferences(profileID: "local") == preferences)
        #expect(try await coldStore.readCheckpoint(plan: paused.snapshot.session.plan) == saved)
        #expect(try await coldWorkspace.load() == expected)
        try await coldDelivery.download(packageKey: book.id) // Installed bytes need no transport.
        let reopened = try await coldWorkspace.openLesson(packageKey: book.id, stage: 1, verifiedTestAccess: false)
        #expect(reopened.initial.snapshot.session.current.confirmed == 1)
        #expect(reopened.initial.snapshot.progress.xp == 1)
        #expect(!reopened.initial.snapshot.session.running)
        #expect(try await coldWorkspace.load() == expected)
        await reopened.controller.deactivate()
    }
    @Test func configuredLocalVideoInstallsOfflineWithPinnedAnalysisAndOriginalTiming() async throws {
        let root = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString).resolvingSymlinksInPath()
        defer { try? FileManager.default.removeItem(at: root) }
        let source = root.appendingPathComponent("LocalVideo")
        try FileManager.default.createDirectory(at: source.appendingPathComponent("video"), withIntermediateDirectories: true)
        let video = Data("abc".utf8)
        let syntax = Data(#"{"schemaVersion":1,"complete":true,"encodingType":"UTF16","language":"en","entryCount":1,"entries":[{"phraseNumber":1,"text":"Hello","status":"complete","error":null,"analysis":{"language":"en","sentences":[{"text":{"content":"Hello","beginOffset":0}}],"tokens":[{"text":{"content":"Hello","beginOffset":0},"partOfSpeech":{"tag":"NOUN"},"dependencyEdge":{"headTokenIndex":0,"label":"ROOT"}}]}}]}"#.utf8)
        let manifest = Data(#"{"kind":"video","schemaVersion":1,"id":"video-practice","version":1,"title":"Video practice","media":{"file":"video/source.mp4","bytes":3,"sha256":"ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad","duration":10},"phrases":[{"id":"one","start":2,"end":4,"text":"Hello","translation":"안녕"}]}"#.utf8)
        try video.write(to: source.appendingPathComponent("video/source.mp4"))
        try syntax.write(to: source.appendingPathComponent("syntax.json"))
        try manifest.write(to: source.appendingPathComponent("manifest.json"))
        let configuration = try ProductServiceConfiguration(values: [:], sampleRoot: root, localVideoRoot: source)
        let assets = try #require(configuration.localVideo)
        let book = try #require(configuration.books.first)
        let delivery = try ContentDelivery(root: root.appendingPathComponent("installed"), packages: configuration.packages,
            transport: { _ in assets })
        let catalog = InstalledProductCatalog(bundled: EmptyInstalledCatalog(), delivery: delivery, listings: configuration.books)
        #expect(await !catalog.permitsPractice(packageKey: book.id))
        try await delivery.download(packageKey: book.id)
        let materials = try await catalog.materials(packageKey: book.id)
        guard case .video(_, let start, let end) = materials.media[0] else { Issue.record("Missing video"); return }
        #expect(start == 2 && end == 4)
        let installedSyntax = try #require(await catalog.syntax(packageKey: book.id))
        #expect(installedSyntax.byteCount == syntax.count)
        #expect(await catalog.permitsPractice(packageKey: book.id))
        let workspace = ProductWorkspace(store: SQLiteLearningStore(root: root.appendingPathComponent("learning")), catalog: catalog, profileID: "local")
        let opened = try await workspace.openLesson(packageKey: book.id, stage: 1, verifiedTestAccess: false)
        #expect(try await workspace.readAnalysis(AnalysisRequest(state: opened.initial)).map(\.text) == ["Hello"])
        await opened.controller.deactivate()
        try await delivery.remove(packageKey: book.id)
        #expect(await !catalog.permitsPractice(packageKey: book.id))
        #expect(try Data(contentsOf: source.appendingPathComponent("video/source.mp4")) == video)
    }
    @Test func downloadedSourcesRequireAuthorityAndRemovingContentNeverGrantsPractice() async throws {
        let root = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
        defer { try? FileManager.default.removeItem(at: root) }
        let audio = Data("abc".utf8)
        let manifest = Data(#"{"id":"morning-notes","version":1,"title":"Sample","phrases":[{"text":"Hello","translation":"안녕","file":"audio/one.m4a","bytes":3,"sha256":"ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad"}]}"#.utf8)
        let files = ["manifest.json": manifest, "audio/one.m4a": audio]
        let descriptor = DeliveryPackage(key: "hosted-morning-notes-v1", files: files.map {
            .init(file: $0.key, bytes: $0.value.count, sha256: SHA256.hash(data: $0.value).map { String(format: "%02x", $0) }.joined())
        })
        let delivery = try ContentDelivery(root: root, packages: [.init(descriptor: descriptor, assetPackID: nil)], transport: { _ in CatalogAssets(files: files) })
        let parsed = try PackageManifest.decode(manifest, descriptor: descriptor)
        #expect(parsed.learningBookID == "hosted-morning-notes")
        let book = CatalogBook(id: descriptor.key, book: parsed.learningBookID, language: "english", title: "Sample", sentenceCount: 1)
        let catalog = InstalledProductCatalog(bundled: EmptyInstalledCatalog(), delivery: delivery, listings: [book])
        let workspace = ProductWorkspace(store: SQLiteLearningStore(root: root.appendingPathComponent("learning")), catalog: catalog, profileID: "local")
        #expect(try await workspace.load().books.count == 1)
        #expect(try await catalog.books() == [book])
        #expect(await !catalog.permitsPractice(packageKey: book.id))
        try await delivery.download(packageKey: book.id)
        #expect(await catalog.permitsPractice(packageKey: book.id))
        #expect(try await catalog.materials(packageKey: book.id).sources.first?.text == "Hello")
        #expect(try await catalog.syntax(packageKey: book.id) == nil)
        try await delivery.remove(packageKey: book.id)
        #expect(await !catalog.permitsPractice(packageKey: book.id))
        await #expect(throws: (any Error).self) { try await catalog.materials(packageKey: book.id) }
    }
}

private struct CatalogAssets: AssetDelivery {
    let files: [String: Data]
    func download(progress: @escaping @Sendable (Double) async -> Void) async throws { await progress(1) }
    func contents(_ file: String) throws -> Data { try #require(files[file]) }
}
private struct EmptyInstalledCatalog: ProductCatalog {
    func books() async throws -> [CatalogBook] { [] }
    func materials(packageKey: String) async throws -> BookMaterials { throw ProductError.denied }
    func permitsPractice(packageKey: String) async -> Bool { false }
}
