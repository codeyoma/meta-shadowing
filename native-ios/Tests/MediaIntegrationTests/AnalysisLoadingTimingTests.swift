import AppleServices
import AppFoundation
import CryptoKit
import Foundation
import LearningDomain
import LearningPersistence
import Testing

@Suite(.serialized) struct AnalysisLoadingTimingTests {
    @Test func repeatedInstalledAnalysisReadsPreservePausedLearning() async throws {
        let root = URL.temporaryDirectory.appending(path: UUID().uuidString).resolvingSymlinksInPath()
        defer { try? FileManager.default.removeItem(at: root) }
        let fixture = try AnalysisTimingAssets.make()
        let delivery = try ContentDelivery(root: root.appending(path: "installed"), packages: [fixture.package],
            transport: { _ in fixture.assets })
        try await delivery.download(packageKey: fixture.book.id)
        let catalog = InstalledProductCatalog(
            bundled: BundledProductCatalog(root: Bundle.main.bundleURL.appending(path: "sample")),
            delivery: delivery, listings: [fixture.book])
        let store = SQLiteLearningStore(root: root.appending(path: "store"))
        let workspace = ProductWorkspace(store: store, catalog: catalog, profileID: "analysis-timing")
        let opened = try await workspace.openLesson(packageKey: fixture.book.id, stage: 1, verifiedTestAccess: false)
        let initial = opened.initial
        #expect(initial.active && initial.paused)
        #expect(opened.materials.sources.count == 560)
        #expect(initial.snapshot.progress.xp == 0)
        let request = AnalysisRequest(state: initial)
        let clock = ContinuousClock()

        do {
            for sample in 1...5 {
                let start = clock.now
                let sentences = try await workspace.readAnalysis(request)
                let elapsed = start.duration(to: clock.now).components
                let milliseconds = Double(elapsed.seconds) * 1_000 + Double(elapsed.attoseconds) / 1e15
                // Diagnostic measurements have no timing threshold or CI performance assertion.
                print(String(format: "ANALYSIS_LOADING_TIMING sources=560 media_bytes_each=32768 sample=%d milliseconds=%.3f",
                             sample, milliseconds))
                #expect(sentences.count == 1)
                #expect(sentences.map(\.text) == ["Birds fly."])
                #expect(sentences.map(\.sourceIndex) == [0])
                #expect(await opened.controller.state == initial)
            }
            let progress = try await store.readProgress(scope: request.scope, today: StudyDay("2026-10-08"))
            #expect(progress.xp == 0)
            #expect(progress.completedRuns.isEmpty)
            await opened.controller.deactivate()
        } catch {
            await opened.controller.deactivate()
            throw error
        }
    }
}

private struct AnalysisTimingAssets: AssetDelivery {
    let files: [String: Data]

    func download(progress: @escaping AssetDeliveryProgress) async throws { await progress(1) }

    func contents(_ file: String) throws -> Data {
        guard let data = files[file] else { throw CocoaError(.fileReadNoSuchFile) }
        return data
    }

    static func make() throws -> (package: HostedPackage, book: CatalogBook, assets: Self) {
        // This existing free-audio test key admits syntax metadata. The UUID root and
        // every payload are synthetic; no installed development package is accessed.
        let key = "duo-33-free-test-v2"
        let bookID = "duo-33-free-test"
        let audio = Data(repeating: 0x5a, count: 32_768)
        let audioHash = digest(audio)
        var files: [String: Data] = [:]
        var phrases: [[String: Any]] = []
        var entries: [[String: Any]] = []
        for phraseNumber in 1...560 {
            let path = String(format: "audio/phrase-%03d.m4a", phraseNumber)
            // These pinned byte fixtures are never submitted to a media decoder.
            files[path] = audio
            phrases.append(["text": "Birds fly.", "translation": "새가 날아요.",
                            "file": path, "bytes": audio.count, "sha256": audioHash])
            entries.append([
                "phraseNumber": phraseNumber, "text": "Birds fly.", "status": "complete", "error": NSNull(),
                "analysis": [
                    "language": "en",
                    "sentences": [["text": ["content": "Birds fly.", "beginOffset": 0]]],
                    "tokens": [
                        token("Birds", offset: 0, pos: "NOUN", head: 1, relation: "NSUBJ"),
                        token("fly", offset: 6, pos: "VERB", head: 1, relation: "ROOT"),
                        token(".", offset: 9, pos: "PUNCT", head: 1, relation: "P")
                    ]
                ]
            ])
        }
        files["manifest.json"] = try JSONSerialization.data(withJSONObject: [
            "id": bookID, "version": 2, "title": "Synthetic analysis timing", "language": "english", "phrases": phrases
        ], options: [.sortedKeys])
        files["syntax.json"] = try JSONSerialization.data(withJSONObject: [
            "schemaVersion": 1, "complete": true, "encodingType": "UTF16", "language": "en",
            "entryCount": 560, "entries": entries
        ], options: [.sortedKeys])
        let descriptor = DeliveryPackage(key: key, files: files.keys.sorted().map { path in
            let bytes = files[path]!
            return .init(file: path, bytes: bytes.count, sha256: digest(bytes))
        })
        return (.init(descriptor: descriptor, assetPackID: nil),
                .init(id: key, book: bookID, language: "english", title: "Synthetic analysis timing", sentenceCount: 560),
                Self(files: files))
    }

    private static func token(_ text: String, offset: Int, pos: String, head: Int, relation: String) -> [String: Any] {
        ["text": ["content": text, "beginOffset": offset], "partOfSpeech": ["tag": pos],
         "dependencyEdge": ["headTokenIndex": head, "label": relation]]
    }

    private static func digest(_ data: Data) -> String {
        SHA256.hash(data: data).map { String(format: "%02x", $0) }.joined()
    }
}
