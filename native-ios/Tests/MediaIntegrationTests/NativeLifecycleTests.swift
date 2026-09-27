import AVFoundation
import UIKit
import MediaPlayer
import Testing
import LearningMedia
import LearningDomain
import LearningPersistence
import AppFoundation
@testable import MetaShadowingNative

@Suite(.serialized) @MainActor struct NativeLifecycleTests {
    @Test func reappearanceDuringFixturePreparationPublishesOnlyLatestRuntime() async throws {
        let root = try MediaFixtureFactory.root()
        defer { try? FileManager.default.removeItem(at: root) }
        let gate = FixturePreparationGate()
        let model = SyntheticMediaProbeModel(root: root, mode: "audio", prepareAssets: { try await gate.prepare($0, $1) })
        let first = Task { await model.open() }
        let deadline = ContinuousClock.now + .seconds(5)
        while !(await gate.entered), ContinuousClock.now < deadline { try await Task.sleep(for: .milliseconds(10)) }
        #expect(await gate.entered)
        model.close()
        let second = Task { await model.open() }
        await Task.yield()
        await gate.release()
        await first.value; await second.value
        #expect(model.runtime != nil)
        let current = model.runtime
        model.close(); await current?.close()
    }
    @Test func completedLessonReleasesRemoteOwnership() async throws {
        let root = try MediaFixtureFactory.root()
        defer { try? FileManager.default.removeItem(at: root) }
        let scope = try LearningScope(profileID: "runtime", packageKey: "fixture-v1", language: "english", book: "fixture", stage: 11)
        let plan = try LearningPlan.make(scope: scope, runID: "runtime", sources: [.init(index: 0, text: "One", translation: "하나")], groupSize: 2)
        let store = SQLiteLearningStore(root: root)
        let initial = try await store.open(plan: plan, preferences: .fresh, writerID: UUID())
        let controller = LearningController(store: store, snapshot: initial)
        let catalog = try MediaAssetCatalog(scope: scope, sourceCount: 1, root: root, sources: [.audio(file: root.appending(path: "unused.wav"))])
        let runtime = NativeLearningRuntime(controller: controller, initial: await controller.state, catalog: catalog,
            authorize: { _ in true }, makeTransport: { _ in Issue.record("Silent runtime opened media"); return AudioQueueTransport() })
        try await waitForMedia { MPNowPlayingInfoCenter.default().nowPlayingInfo != nil }
        _ = await runtime.coordinator.perform(.resume)
        try await waitForMedia { runtime.state.controller.snapshot.session.phase == .speaking && !runtime.state.busy }
        _ = await runtime.coordinator.perform(.confirm)
        #expect(runtime.state.controller.snapshot.session.phase == .complete)
        #expect(MPNowPlayingInfoCenter.default().nowPlayingInfo == nil)
        await runtime.close()
    }

    @Test func reopeningProbeAwaitsPreviousRuntimeTeardown() async throws {
        let root = try MediaFixtureFactory.root()
        defer { try? FileManager.default.removeItem(at: root) }
        let model = SyntheticMediaProbeModel(root: root, mode: "audio")
        await model.open()
        let old = try #require(model.runtime)
        _ = await old.coordinator.perform(.resume)
        model.close()
        await model.open()
        let replacement = try #require(model.runtime)
        #expect(!old.state.controller.active)
        #expect(replacement.state.controller.active && replacement.state.controller.paused)
        model.close(); await replacement.close()
    }
    @Test func inactiveRemoteLeaseCannotClearAnotherOwnersMetadata() {
        let session = LessonAudioSession()
        let remote = LessonRemoteControl(session: session)
        let center = MPNowPlayingInfoCenter.default()
        let previous = center.nowPlayingInfo
        defer { center.nowPlayingInfo = previous; session.close() }
        center.nowPlayingInfo = [MPMediaItemPropertyTitle: "Other fixture owner"]
        remote.close()
        #expect(center.nowPlayingInfo?[MPMediaItemPropertyTitle] as? String == "Other fixture owner")
        remote.close()
        #expect(center.nowPlayingInfo?[MPMediaItemPropertyTitle] as? String == "Other fixture owner")
    }

    @Test func retiredGraphCannotInvalidateReplacement() {
        let center = NotificationCenter()
        let observation = AudioGraphObservation(center: center)
        let first = AVAudioEngine(), second = AVAudioEngine()
        var invalidations = 0
        observation.watch(first) { invalidations += 1 }
        observation.watch(second) { invalidations += 1 }
        center.post(name: .AVAudioEngineConfigurationChange, object: first)
        #expect(invalidations == 0)
        center.post(name: .AVAudioEngineConfigurationChange, object: second)
        #expect(invalidations == 1)
        observation.stop()
        center.post(name: .AVAudioEngineConfigurationChange, object: second)
        #expect(invalidations == 1)
    }

    @Test func shutdownRemovesLifecycleObservers() {
        let center = NotificationCenter()
        var events: [LessonLifecycleEvent] = []
        let observer = LessonLifecycleObserver(center: center) { events.append($0) }
        center.post(name: UIApplication.willResignActiveNotification, object: nil)
        center.post(name: AVAudioSession.interruptionNotification, object: nil,
            userInfo: [AVAudioSessionInterruptionTypeKey: AVAudioSession.InterruptionType.began.rawValue])
        center.post(name: AVAudioSession.interruptionNotification, object: nil,
            userInfo: [AVAudioSessionInterruptionTypeKey: AVAudioSession.InterruptionType.ended.rawValue])
        #expect(events == [.inactive, .interrupted])
        observer.close()
        center.post(name: UIApplication.didBecomeActiveNotification, object: nil)
        #expect(events.count == 2)
    }
}

private actor FixturePreparationGate {
    private var continuation: CheckedContinuation<Void, Never>?
    private(set) var entered = false
    func prepare(_ root: URL, _ video: Bool) async throws -> [MediaSource] {
        if !entered {
            entered = true
            await withCheckedContinuation { continuation = $0 }
            try Task.checkCancellation()
        }
        return try await SyntheticMediaFixtures.create(in: root, video: video)
    }
    func release() { continuation?.resume(); continuation = nil }
}
