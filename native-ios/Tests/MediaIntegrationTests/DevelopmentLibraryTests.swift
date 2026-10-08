import AppleServices
import AppFoundation
import CryptoKit
import Foundation
import LearningDomain
import LearningPersistence
import Testing
@testable import MetaShadowingNative

@Suite struct DevelopmentLibraryTests {
    @Test func longTitleSampleUsesValidatedAudioAndIndependentProgress() async throws {
        let root = URL.temporaryDirectory.appending(path: UUID().uuidString)
        defer { try? FileManager.default.removeItem(at: root) }
        let base = BundledProductCatalog(root: Bundle.main.bundleURL.appending(path: "sample"))
        let catalog = DevelopmentLibraryCatalog(bundled: base)
        let books = try await catalog.books()
        #expect(books.map(\.id) == ["morning-notes-v1", DevelopmentLibraryCatalog.sampleKey])
        let original = try await catalog.materials(packageKey: "morning-notes-v1")
        let sample = try await catalog.materials(packageKey: DevelopmentLibraryCatalog.sampleKey)
        #expect(sample.media == original.media)
        #expect(sample.sources == original.sources)
        #expect(sample.book.book != original.book.book)
        #expect(sample.book.title.count > original.book.title.count)

        let workspace = ProductWorkspace(store: SQLiteLearningStore(root: root), catalog: catalog, profileID: "guest")
        let opened = try await workspace.openLesson(packageKey: DevelopmentLibraryCatalog.sampleKey, stage: 1, verifiedTestAccess: true)
        let initial = opened.initial.snapshot
        let running = await opened.controller.send(LearningCommand(handle: initial.handle, id: UUID(),
            expectedVersion: initial.writerVersion, event: .resume))
        #expect(!running.saveFailed)
        let paused = await opened.controller.send(LearningCommand(handle: running.snapshot.handle, id: UUID(),
            expectedVersion: running.snapshot.writerVersion, event: .pause))
        #expect(!paused.saveFailed)
        await opened.controller.deactivate()
        let snapshot = try await workspace.load()
        #expect(snapshot.books[0].checkpoints.isEmpty)
        #expect(snapshot.books[1].checkpoints[1] != nil)
        #expect(snapshot.books.allSatisfy { $0.completedStages == 0 })
        #expect(await catalog.permitsPractice(packageKey: "missing-v1") == false)
        await #expect(throws: ProductError.denied) {
            _ = try await catalog.materials(packageKey: "missing-v1")
        }
    }

    @Test(arguments: [false, true])
    func localDuoUsesNormalInstallationValidation(corrupt: Bool) async throws {
        let root = URL.temporaryDirectory.appending(path: UUID().uuidString).resolvingSymlinksInPath()
        defer { try? FileManager.default.removeItem(at: root) }
        let source = root.appending(path: "source")
        try Self.makeSource(at: source)
        let assets = try DevelopmentDuoAssets(root: source)
        #expect(assets.book.title == "DUO 3.3")
        #expect(assets.book.id == "duo-33-free-test-v2")
        #expect(throws: DeliveryError.invalidPackage) { _ = try assets.contents("../manifest.json") }
        if corrupt { try Data([9]).write(to: source.appending(path: "audio/phrase-01.m4a")) }
        let delivery = try ContentDelivery(root: root.appending(path: "installed"), packages: [assets.package],
                                          transport: { _ in assets })
        #expect(try await delivery.state(packageKey: assets.book.id).phase != "ready")
        if corrupt {
            await #expect(throws: DeliveryError.damagedFiles) { try await delivery.download(packageKey: assets.book.id) }
            #expect(try await delivery.state(packageKey: assets.book.id).phase != "ready")
        } else {
            try await delivery.download(packageKey: assets.book.id)
            let catalog = InstalledProductCatalog(
                bundled: BundledProductCatalog(root: Bundle.main.bundleURL.appending(path: "sample")),
                delivery: delivery, listings: [assets.book])
            let materials = try await catalog.materials(packageKey: assets.book.id)
            #expect(materials.sources.count == 1)
            #expect(materials.book.book == "duo-33-free-test")
            try await delivery.remove(packageKey: assets.book.id)
            #expect(await catalog.permitsPractice(packageKey: assets.book.id) == false)
        }
    }

    @Test func localDuoRejectsSymlinkedSourceFiles() throws {
        let root = URL.temporaryDirectory.appending(path: UUID().uuidString).resolvingSymlinksInPath()
        defer { try? FileManager.default.removeItem(at: root) }
        try Self.makeSource(at: root)
        let assets = try DevelopmentDuoAssets(root: root)
        let audio = root.appending(path: "audio/phrase-01.m4a")
        let outside = root.appending(path: "outside.m4a")
        try FileManager.default.moveItem(at: audio, to: outside)
        try FileManager.default.createSymbolicLink(at: audio, withDestinationURL: outside)
        #expect(throws: DeliveryError.invalidPackage) { _ = try assets.contents("audio/phrase-01.m4a") }
    }

    private static func makeSource(at root: URL) throws {
        let audio = Data([1, 2, 3])
        let audioEntry = entry("audio/phrase-01.m4a", audio)
        let manifest = try JSONSerialization.data(withJSONObject: [
            "id": "duo-33-free-test", "version": 2, "title": "Public test fixture",
            "phrases": [["text": "An original test sentence.", "translation": "테스트 문장입니다.",
                         "file": audioEntry.file, "bytes": audioEntry.bytes, "sha256": audioEntry.sha256]]
        ])
        let descriptor = DeliveryPackage(key: "duo-33-free-test-v2", files: [entry("manifest.json", manifest), audioEntry])
        try FileManager.default.createDirectory(at: root.appending(path: "audio"), withIntermediateDirectories: true)
        try audio.write(to: root.appending(path: audioEntry.file))
        try manifest.write(to: root.appending(path: "manifest.json"))
        try JSONEncoder().encode(descriptor).write(to: root.appending(path: "descriptor.json"))
    }

    private static func entry(_ file: String, _ data: Data) -> DeliveryPackage.Entry {
        .init(file: file, bytes: data.count, sha256: SHA256.hash(data: data).map { String(format: "%02x", $0) }.joined())
    }
}
