import Foundation
import LearningDomain
import Testing
@testable import AppFoundation

@Suite struct SyntheticLearningWorkspaceTests {
    @Test func explicitConfirmationSurvivesWorkspaceRecreation() async throws {
        let root = FileManager.default.temporaryDirectory.appending(path: UUID().uuidString)
        defer { try? FileManager.default.removeItem(at: root) }
        let workspace = SyntheticLearningWorkspace(root: root)
        let controller = try await workspace.open()
        let initial = await controller.state
        #expect(initial.paused && initial.snapshot.progress.xp == 0)
        let ended = await workspace.finishReveal(controller)
        #expect(ended.snapshot.session.phase == .speaking && ended.snapshot.progress.xp == 0)
        let confirmed = await workspace.confirm(controller)
        #expect(confirmed.snapshot.progress.xp == 3)
        #expect(confirmed.snapshot.session.sourceProgress.filter { $0.confirmed > 0 }.count == 1)
        await controller.deactivate()
        let reopenedWorkspace = SyntheticLearningWorkspace(root: root)
        let reopenedController = try await reopenedWorkspace.open()
        let restored = await reopenedController.state
        #expect(restored.paused && restored.snapshot.progress.xp == 3)
        #expect(restored.snapshot.session.sourceProgress == confirmed.snapshot.session.sourceProgress)
        _ = await reopenedWorkspace.finishReveal(reopenedController)
        let complete = await reopenedWorkspace.confirm(reopenedController)
        #expect(complete.snapshot.session.phase == .complete && complete.snapshot.progress.xp == 6)
        #expect(complete.snapshot.progress.completedRuns[11] == 1)
    }
}
