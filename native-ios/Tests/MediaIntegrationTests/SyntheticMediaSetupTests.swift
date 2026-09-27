import Foundation
import Testing
import LearningDomain
import LearningPersistence
import LearningMedia
@testable import MetaShadowingNative

@MainActor struct SyntheticMediaSetupTests {
    @Test(arguments: [false, true]) func generatedProbeOpensThroughRealBoundaries(video: Bool) async throws {
        let root = try MediaFixtureFactory.root()
        defer { try? FileManager.default.removeItem(at: root) }
        let sources: [MediaSource]
        do { sources = try await SyntheticMediaFixtures.create(in: root, video: video) }
        catch { Issue.record("Generated media setup failed: \((error as NSError).domain):\((error as NSError).code)"); throw error }
        let scope = try LearningScope(profileID: "media-probe", packageKey: "generated-media-v1", language: "english", book: "generated-media", stage: 7)
        let plan = try LearningPlan.make(scope: scope, runID: "generated-media-run", sources: [
            .init(index: 0, text: "One", translation: "하나"), .init(index: 1, text: "Two", translation: "둘")], groupSize: 2)
        do { _ = try await SQLiteLearningStore(root: root).open(plan: plan, preferences: .fresh, writerID: UUID()) }
        catch { Issue.record("SQLite setup failed"); throw error }
        let catalog = try MediaAssetCatalog(scope: scope, sourceCount: 2, root: root, sources: sources)
        #expect(try catalog.sources(for: plan, unit: 0).count == 2)
    }
}
