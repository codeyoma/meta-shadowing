import Foundation
import LearningDomain
import Testing
import AppFoundation

struct PreviewWorkspaceTests {
    @Test func rootsAreIndependentAndCorruptionIsPreserved() async throws {
        let firstRoot = FileManager.default.temporaryDirectory.appending(path: UUID().uuidString)
        let secondRoot = FileManager.default.temporaryDirectory.appending(path: UUID().uuidString)
        defer {
            try? FileManager.default.removeItem(at: firstRoot)
            try? FileManager.default.removeItem(at: secondRoot)
        }
        let first = PreviewWorkspace(root: firstRoot)
        _ = try await first.loadLibrary()
        let corruptFile = firstRoot.appending(path: "SwiftNativeFoundation/v1/library.json")
        let corrupt = Data("invalid existing content".utf8)
        try corrupt.write(to: corruptFile)
        await #expect(throws: (any Error).self) { try await first.loadLibrary() }
        #expect(try Data(contentsOf: corruptFile) == corrupt)
        let independent = try await PreviewWorkspace(root: secondRoot).loadLibrary()
        #expect(independent.lessons.count == 1)
    }

    @Test func inaccessibleDirectoryFailsWithoutReplacingIt() async throws {
        let root = FileManager.default.temporaryDirectory.appending(path: UUID().uuidString)
        defer { try? FileManager.default.removeItem(at: root) }
        let sentinel = Data("not a directory".utf8)
        try sentinel.write(to: root)
        await #expect(throws: (any Error).self) {
            try await PreviewWorkspace(root: root).loadLibrary()
        }
        #expect(try Data(contentsOf: root) == sentinel)
    }

    @Test func cancelledLoadDoesNotCreateStorage() async throws {
        let root = FileManager.default.temporaryDirectory.appending(path: UUID().uuidString)
        defer { try? FileManager.default.removeItem(at: root) }
        let task = Task {
            withUnsafeCurrentTask { $0?.cancel() }
            return try await PreviewWorkspace(root: root).loadLibrary()
        }
        await #expect(throws: CancellationError.self) { try await task.value }
        #expect(!FileManager.default.fileExists(atPath: root.path))
    }

    @Test func seedsAndReopensScopedLibrary() async throws {
        let root = FileManager.default.temporaryDirectory.appending(path: UUID().uuidString)
        defer { try? FileManager.default.removeItem(at: root) }
        let first = try await PreviewWorkspace(root: root).loadLibrary()
        let reopened = try await PreviewWorkspace(root: root).loadLibrary()
        #expect(first == reopened)
        #expect(first.lessons.count == 1)
        #expect(first.lessons[0].sentences.count == 3)
        #expect(FileManager.default.fileExists(atPath:
            root.appending(path: "SwiftNativeFoundation/v1/library.json").path))
        #expect(try FileManager.default.contentsOfDirectory(atPath: root.path) == ["SwiftNativeFoundation"])
    }
}
