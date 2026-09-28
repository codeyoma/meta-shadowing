import Foundation
import Testing
@testable import AppFoundation

@Suite struct ProductCatalogTests {
    static var sampleRoot: URL {
        URL(fileURLWithPath: #filePath).deletingLastPathComponent().deletingLastPathComponent()
            .deletingLastPathComponent().deletingLastPathComponent().deletingLastPathComponent()
            .deletingLastPathComponent().appending(path: "assets/sample")
    }

    @Test func bundledSampleHasValidatedOriginalAudio() async throws {
        let catalog = BundledProductCatalog(root: Self.sampleRoot)
        let books = try await catalog.books()
        #expect(books.count == 1)
        #expect(books.first?.id == "morning-notes-v1")
        let materials = try await catalog.materials(packageKey: "morning-notes-v1")
        #expect(materials.sources.count == 12)
        #expect(materials.sources.first?.text == "I opened the window to let in the morning air.")
        #expect(materials.media.count == 12)
    }

    @Test(arguments: ["corrupt", "traversal", "symlink", "identity"])
    func catalogRejectsEscapedOrCorruptAudio(_ kind: String) async throws {
        let temporary = FileManager.default.temporaryDirectory.appending(path: UUID().uuidString)
        try FileManager.default.copyItem(at: Self.sampleRoot, to: temporary)
        defer { try? FileManager.default.removeItem(at: temporary) }
        let audio = temporary.appending(path: "audio/phrase-01.m4a")
        if kind == "corrupt" { try Data([0, 1, 2]).write(to: audio) }
        if kind == "symlink" {
            try FileManager.default.removeItem(at: audio)
            try FileManager.default.createSymbolicLink(at: audio, withDestinationURL: Self.sampleRoot.appending(path: "audio/phrase-01.m4a"))
        }
        if kind == "traversal" || kind == "identity" {
            let file = temporary.appending(path: "manifest.json")
            var json = try #require(JSONSerialization.jsonObject(with: Data(contentsOf: file)) as? [String: Any])
            if kind == "identity" { json["language"] = "unknown" }
            else {
                var phrases = try #require(json["phrases"] as? [[String: Any]])
                phrases[0]["file"] = "../sample/audio/phrase-01.m4a"
                json["phrases"] = phrases
            }
            try JSONSerialization.data(withJSONObject: json).write(to: file)
        }
        await #expect(throws: (any Error).self) {
            _ = try await BundledProductCatalog(root: temporary).materials(packageKey: "morning-notes-v1")
        }
    }
}
