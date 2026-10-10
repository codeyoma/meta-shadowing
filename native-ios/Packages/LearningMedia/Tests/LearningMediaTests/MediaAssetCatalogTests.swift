import Foundation
import Testing
import LearningDomain
import LearningMedia

func mediaScope(stage: Int = 1) throws -> LearningScope {
    try LearningScope(profileID: "media-test", packageKey: "fixture-v1", language: "english", book: "fixture", stage: stage)
}

struct MediaAssetCatalogTests {
    @Test func overlappingVideoCatalogKeepsSingleAndGroupedSourceBounds() throws {
        let root = URL.temporaryDirectory.appending(path: UUID().uuidString)
        let file = root.appending(path: "source.mp4")
        let sources: [MediaSource] = [.video(file: file, start: 1, end: 3), .video(file: file, start: 2.8, end: 4)]
        for stage in [1, 7] {
            let scope = try mediaScope(stage: stage)
            let catalog = try MediaAssetCatalog(scope: scope, sourceCount: 2, root: root, sources: sources)
            let plan = try LearningPlan.make(scope: scope, runID: "overlap", sources: [
                .init(index: 0, text: "One", translation: "하나"), .init(index: 1, text: "Two", translation: "둘")], groupSize: 2)
            #expect(try catalog.sources(for: plan, unit: 0) == (stage == 1 ? [sources[0]] : sources))
            if stage == 1 { #expect(try catalog.sources(for: plan, unit: 1) == [sources[1]]) }
        }
    }

    @Test func catalogRejectsEscapedSymlinkAndNetworkURL() throws {
        let root = FileManager.default.temporaryDirectory.appending(path: UUID().uuidString)
        let package = root.appending(path: "package")
        try FileManager.default.createDirectory(at: package, withIntermediateDirectories: true)
        defer { try? FileManager.default.removeItem(at: root) }
        let outside = root.appending(path: "outside.wav")
        try Data([1]).write(to: outside)
        let link = package.appending(path: "link.wav")
        try FileManager.default.createSymbolicLink(at: link, withDestinationURL: outside)
        #expect(throws: MediaFailure.invalidAsset) {
            try MediaAssetCatalog(scope: mediaScope(), sourceCount: 1, root: package, sources: [.audio(file: link)])
        }
        #expect(throws: MediaFailure.invalidAsset) {
            try MediaAssetCatalog(scope: mediaScope(), sourceCount: 1, root: package,
                sources: [.audio(file: URL(string: "https://example.invalid/audio.wav")!)])
        }
    }

    @Test func resolutionRequiresExactScopeAndSourceCount() throws {
        let root = FileManager.default.temporaryDirectory.appending(path: UUID().uuidString)
        try FileManager.default.createDirectory(at: root, withIntermediateDirectories: true)
        defer { try? FileManager.default.removeItem(at: root) }
        let file = root.appending(path: "source.wav")
        try Data([1]).write(to: file)
        let scope = try mediaScope(stage: 7)
        let catalog = try MediaAssetCatalog(scope: scope, sourceCount: 3, root: root,
            sources: [.audio(file: file), .audio(file: file), .audio(file: file)])
        let plan = try LearningPlan.make(scope: scope, runID: "run", sources: (0..<3).map {
            LearningSource(index: $0, text: "Sample", translation: "Example")
        }, groupSize: 2)
        #expect(try catalog.sources(for: plan, unit: 1).count == 1)
        #expect(throws: MediaFailure.invalidAsset) { try catalog.sources(for: plan, unit: 2) }
        #expect(throws: MediaFailure.invalidAsset) {
            try MediaAssetCatalog(scope: scope, sourceCount: 2, root: root, sources: [.audio(file: file)])
        }
        let other = try LearningPlan.make(scope: mediaScope(stage: 8), runID: "run", sources: plan.sources, groupSize: 2)
        #expect(throws: MediaFailure.accessDenied) { try catalog.sources(for: other, unit: 0) }
    }
}
