import Foundation
import CryptoKit
import Testing
import LearningReference

struct InstalledSyntaxReaderTests {
    @Test func publishedFileReadsDoNotRepeatTheDownloadHashCheck() async throws {
        let root = URL.temporaryDirectory.appending(path: UUID().uuidString)
        try FileManager.default.createDirectory(at: root, withIntermediateDirectories: true)
        defer { try? FileManager.default.removeItem(at: root) }
        let original = Data("fixture".utf8), current = Data("changed".utf8)
        let hash = SHA256.hash(data: original).map { String(format: "%02x", $0) }.joined()
        let descriptor = InstalledSyntaxFile(root: root, relativePath: "syntax.json", byteCount: original.count, sha256: hash)
        // Publication verified the original download. Reads retain confinement,
        // bounded size and UTF-8 checks, but do not rescan its digest each time.
        try current.write(to: root.appending(path: "syntax.json"))
        #expect(try await InstalledSyntaxReader().read(descriptor) == current)
    }

    @Test func missingFileUsesPublicErrorWithoutFilesystemDetails() async {
        let file = InstalledSyntaxFile(root: .temporaryDirectory.appending(path: UUID().uuidString),
            relativePath: "missing.json", byteCount: 1, sha256: String(repeating: "0", count: 64))
        await #expect(throws: AnalysisError.invalid) { try await InstalledSyntaxReader().read(file) }
    }
    @Test func cancelledReadRemainsCancellation() async {
        let task = Task {
            withUnsafeCurrentTask { $0?.cancel() }
            return try await InstalledSyntaxReader().read(.init(root: .temporaryDirectory,
                relativePath: "missing.json", byteCount: 1, sha256: String(repeating: "0", count: 64)))
        }
        await #expect(throws: CancellationError.self) { try await task.value }
    }
    @Test(arguments: ["count", "directory"])
    func rejectsIncorrectDescriptorAndNonRegularFile(_ kind: String) async throws {
        let root = FileManager.default.temporaryDirectory.appending(path: UUID().uuidString)
        try FileManager.default.createDirectory(at: root, withIntermediateDirectories: true)
        defer { try? FileManager.default.removeItem(at: root) }
        let data = Data("fixture".utf8)
        let file = root.appending(path: "syntax.json")
        if kind == "directory" { try FileManager.default.createDirectory(at: file, withIntermediateDirectories: true) }
        else { try data.write(to: file) }
        let hash = SHA256.hash(data: data).map { String(format: "%02x", $0) }.joined()
        let descriptor = InstalledSyntaxFile(root: root, relativePath: "syntax.json",
            byteCount: kind == "count" ? data.count + 1 : data.count,
            sha256: hash)
        await #expect(throws: (any Error).self) { try await InstalledSyntaxReader().read(descriptor) }
    }
    @Test func readsPublishedFileAndRejectsInvalidUTF8() async throws {
        let root = FileManager.default.temporaryDirectory.appending(path: UUID().uuidString)
        try FileManager.default.createDirectory(at: root, withIntermediateDirectories: true)
        defer { try? FileManager.default.removeItem(at: root) }
        let data = Data("public fixture".utf8)
        try data.write(to: root.appending(path: "syntax.json"))
        let hash = SHA256.hash(data: data).map { String(format: "%02x", $0) }.joined()
        let reader = InstalledSyntaxReader()
        let descriptor = InstalledSyntaxFile(root: root, relativePath: "syntax.json", byteCount: data.count, sha256: hash)
        #expect(try await reader.read(descriptor) == data)
        try Data(repeating: 0xff, count: data.count).write(to: root.appending(path: "syntax.json"))
        await #expect(throws: (any Error).self) { try await reader.read(descriptor) }
    }
    @Test(arguments: ["../syntax.json", "/syntax.json", "a\\syntax.json", "", "."])
    func rejectsUnconfinedPaths(_ path: String) async {
        await #expect(throws: (any Error).self) {
            try await InstalledSyntaxReader().read(.init(root: URL(filePath: "/tmp"), relativePath: path, byteCount: 1, sha256: "a"))
        }
    }
    @Test func rejectsSymlinkEscapeAndOversize() async throws {
        let root = FileManager.default.temporaryDirectory.appending(path: UUID().uuidString)
        try FileManager.default.createDirectory(at: root, withIntermediateDirectories: true)
        defer { try? FileManager.default.removeItem(at: root) }
        try FileManager.default.createSymbolicLink(at: root.appending(path: "syntax.json"), withDestinationURL: URL(filePath: "/etc/hosts"))
        for count in [1, 20_000_001] {
            await #expect(throws: (any Error).self) {
                try await InstalledSyntaxReader().read(.init(root: root, relativePath: "syntax.json", byteCount: count, sha256: String(repeating: "a", count: 64)))
            }
        }
    }
}
