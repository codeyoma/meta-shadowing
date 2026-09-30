import Foundation
import AppleServices
import LearningDomain
import LearningPersistence
import Testing
@testable import MetaShadowingNative

@Suite @MainActor struct DownloadLabTests {
    @Test func immediateCancellationDoesNotStartOrInstallTransfer() async throws {
        let root = labRoot()
        defer { try? FileManager.default.removeItem(at: root) }
        let model = DeveloperDownloadLabModel(root: root, stepDuration: .milliseconds(10))
        await model.open()
        model.startDownload()
        await model.cancelDownload()
        #expect(!model.installed)
        #expect(model.result == .cancelVerified)
        #expect(!model.downloading)
        await model.close()
    }

    @Test func unexpectedStagingFailureIsNotReportedAsInjectedFailurePass() async throws {
        let root = labRoot()
        defer { try? FileManager.default.removeItem(at: root) }
        let model = DeveloperDownloadLabModel(root: root, stepDuration: .milliseconds(10))
        await model.open()
        let package = try ServiceTestAssets.package(root: Bundle.main.bundleURL.appending(path: "sample")).0
        let content = root.appending(path: "content")
        try FileManager.default.createDirectory(at: content, withIntermediateDirectories: true)
        try Data("blocked staging directory".utf8).write(to: content.appending(path: ".install-\(package.descriptor.key)"))
        model.startDownload()
        try await waitForLab { !model.downloading }
        #expect(!model.installed)
        #expect(model.result == .failed)
        await model.close()
    }

    @Test func reopenWaitsForOwnedDrainAndKeepsNewTransferOwned() async throws {
        let root = labRoot()
        defer { try? FileManager.default.removeItem(at: root) }
        let gate = LabDrainGate()
        let model = DeveloperDownloadLabModel(root: root, stepDuration: .milliseconds(10), drainDelivery: {
            await gate.wait(); await $0.cancelAll()
        })
        await model.open()
        let closing = Task { await model.close() }
        try await waitForDrain(gate)
        let reopening = Task { await model.open(); model.startDownload() }
        // Teardown is deliberately unresolved, so reopening must remain blocked.
        try await Task.sleep(for: .milliseconds(100))
        #expect(!model.ready)
        await gate.release()
        await closing.value; await reopening.value
        #expect(model.ready && model.downloading)
        try await waitForLab { !model.downloading }
        #expect(model.installed)
        await model.close()
    }

    @Test func pausedProgressStaysFrozenUntilExplicitResume() async throws {
        let root = labRoot()
        defer { try? FileManager.default.removeItem(at: root) }
        let model = DeveloperDownloadLabModel(root: root, stepDuration: .milliseconds(10))
        await model.open(); model.startDownload()
        try await waitForLab { model.status.progress > 0 }
        await model.pauseTransfer()
        // Drain an already emitted progress value before testing the stopped interval.
        try await Task.sleep(for: .milliseconds(30))
        let stopped = model.status.progress
        try await Task.sleep(for: .milliseconds(100))
        #expect(model.status.progress == stopped && !model.installed)
        await model.resumeTransfer()
        try await waitForLab { !model.downloading }
        #expect(model.installed && model.result == .installVerified)
        await model.close()
    }

    @Test func cancellationPreventsInstallationAndRetryValidatesRealFiles() async throws {
        let root = labRoot()
        defer { try? FileManager.default.removeItem(at: root) }
        let model = DeveloperDownloadLabModel(root: root, stepDuration: .milliseconds(15))
        await model.open()
        #expect(model.ready)
        model.startDownload()
        try await waitForLab { model.status.progress > 0 }
        await model.pauseTransfer()
        await model.cancelDownload()
        #expect(model.result == .cancelVerified)
        #expect(!model.installed)
        model.startDownload()
        try await waitForLab { !model.downloading }
        #expect(model.result == .installVerified)
        #expect(model.installed)
        await model.close()
        let reopened = DeveloperDownloadLabModel(root: root)
        await reopened.open()
        #expect(reopened.installed)
        await reopened.close()
    }

    @Test func failureWhilePausedSettlesWithoutInstallationAndAllowsRetry() async throws {
        let root = labRoot()
        defer { try? FileManager.default.removeItem(at: root) }
        let model = DeveloperDownloadLabModel(root: root, stepDuration: .milliseconds(15))
        await model.open()
        model.startDownload()
        try await waitForLab { model.status.progress > 0 }
        await model.pauseTransfer()
        #expect(model.paused)
        await model.failTransfer()
        try await waitForLab { !model.downloading }
        #expect(model.result == .failureVerified)
        #expect(!model.installed)
        model.startDownload()
        try await waitForLab { !model.downloading }
        #expect(model.installed)
        await model.close()
    }

    @Test func closingPausedTransferCannotPublishLateInstallation() async throws {
        let root = labRoot()
        defer { try? FileManager.default.removeItem(at: root) }
        let model = DeveloperDownloadLabModel(root: root, stepDuration: .milliseconds(15))
        await model.open()
        model.startDownload()
        try await waitForLab { model.status.progress > 0 }
        await model.pauseTransfer()
        await model.close()
        #expect(!model.ready)
        let reopened = DeveloperDownloadLabModel(root: root, stepDuration: .milliseconds(15))
        await reopened.open()
        #expect(!reopened.installed)
        reopened.startDownload()
        try await waitForLab { !reopened.downloading }
        #expect(reopened.installed)
        await reopened.close()
    }

    @Test func realLocalResetPreservesDownloadAndRestoresCheckpointOnce() async throws {
        let root = labRoot()
        defer { try? FileManager.default.removeItem(at: root) }
        let neighbor = SQLiteLearningStore(root: root.appending(path: "untouched"))
        _ = try await neighbor.savePreferences(.init(libraryLanguage: "french"), profileID: "local")
        let original = try await neighbor.exportBackup(profileID: "local").payload
        let model = DeveloperDownloadLabModel(root: root, stepDuration: .milliseconds(10))
        await model.open()
        model.startDownload()
        try await waitForLab { !model.downloading }
        #expect(model.installed)
        await model.prepareHistory()
        #expect(model.xp == 3)
        #expect(model.hasCheckpoint && model.hasBackup)
        await model.resetHistory()
        #expect(model.result == .resetVerified)
        #expect(model.xp == 0 && !model.hasCheckpoint)
        #expect(model.installed && model.hasBackup)
        await model.close()
        let reopened = DeveloperDownloadLabModel(root: root)
        await reopened.open()
        #expect(reopened.xp == 0 && !reopened.hasCheckpoint)
        await reopened.restoreHistory()
        #expect(reopened.result == .restoreVerified)
        #expect(reopened.xp == 3 && reopened.hasCheckpoint)
        await reopened.restoreHistory()
        await reopened.reopenHistory()
        #expect(reopened.xp == 3 && reopened.hasCheckpoint)
        #expect(reopened.installed)
        #expect(try await neighbor.exportBackup(profileID: "local").payload == original)
        await reopened.close()
    }

    private func labRoot() -> URL { FileManager.default.temporaryDirectory.appending(path: UUID().uuidString) }
}

private actor LabDrainGate {
    private(set) var entered = false
    private var released = false
    private var waiter: AsyncStream<Void>.Continuation?
    func wait() async {
        entered = true
        guard !released else { return }
        let (stream, continuation) = AsyncStream<Void>.makeStream()
        waiter = continuation
        for await _ in stream { break }
    }
    func release() { released = true; waiter?.yield(()); waiter?.finish(); waiter = nil }
}

@MainActor private func waitForDrain(_ gate: LabDrainGate) async throws {
    let deadline = ContinuousClock.now + .seconds(5)
    while !(await gate.entered), ContinuousClock.now < deadline { try await Task.sleep(for: .milliseconds(10)) }
    try #require(await gate.entered)
}

@MainActor private func waitForLab(_ condition: () -> Bool) async throws {
    let deadline = ContinuousClock.now + .seconds(8)
    while !condition(), ContinuousClock.now < deadline { try await Task.sleep(for: .milliseconds(10)) }
    try #require(condition(), "The lab operation did not settle within its bounded deadline")
}
