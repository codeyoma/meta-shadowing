import Foundation
import CryptoKit
import Testing
import LearningReference

struct InstalledSyntaxReaderTests {
    @Test func readsVerifiedFileAndRejectsDamage() async throws {
        let root = FileManager.default.temporaryDirectory.appending(path: UUID().uuidString)
        try FileManager.default.createDirectory(at: root, withIntermediateDirectories: true)
        defer { try? FileManager.default.removeItem(at: root) }
        let data = Data("public fixture".utf8)
        try data.write(to: root.appending(path: "syntax.json"))
        let hash = SHA256.hash(data: data).map { String(format: "%02x", $0) }.joined()
        let reader = InstalledSyntaxReader()
        let descriptor = InstalledSyntaxFile(root: root, relativePath: "syntax.json", byteCount: data.count, sha256: hash)
        #expect(try await reader.read(descriptor) == data)
        try Data("tampered bytes".utf8).write(to: root.appending(path: "syntax.json"))
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
