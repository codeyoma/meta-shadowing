import ExpoModulesCore
import AVFoundation
import UIKit

public class LearningAudioModule: Module {
  private let videoPackage = LocalVideoPackage(source: LocalVideoPackage.bundledSource,
    packages: URL.documentsDirectory.appendingPathComponent("lesson-packages"))
  private let inspection = LocalAudioInspection(packages: URL.documentsDirectory.appendingPathComponent("lesson-packages"))
  @MainActor private var monitor: VoiceMonitorService?
  @MainActor private var remote: LessonRemoteControl?
  @MainActor private var videoOwner: String?
  private let monitorLifetime = MonitorLifetime()

  @MainActor private func activateRemote(_ owner: String) throws {
    guard monitorLifetime.isOpen, remote?.owner == owner,
          UIApplication.shared.applicationState == .active else { return }
    try monitoring().configurePlayback()
    try AVAudioSession.sharedInstance().setActive(true)
  }

  @MainActor private func monitoring() throws -> VoiceMonitorService {
    guard monitorLifetime.isOpen else { throw LocalAudioError.invalidInput }
    if let monitor { return monitor }
    let service = VoiceMonitorService(lifetime: monitorLifetime)
    service.onChange = { [weak self] value in
      guard let self, self.monitorLifetime.isOpen else { return }
      self.sendEvent("onMonitorStatus", value)
    }
    monitor = service
    return service
  }

  private func destroyMonitoring() {
    monitorLifetime.close()
    DispatchQueue.main.async {
      if let owner = self.videoOwner { LessonVideoPlayer.shared.dispose(owner: owner) }
      self.videoOwner = nil
      self.remote?.shutdown(); self.remote = nil
      self.monitor?.shutdown(); self.monitor = nil
    }
  }

  public func definition() -> ModuleDefinition {
    Name("LearningAudio")
    Events("onMonitorStatus", "onLessonRemotePress", "onVideoStatus")
    Constant("localVideoManifest") { self.videoPackage.json }
    Constant("localVideoManifestInvalid") { self.videoPackage.manifestInvalid }
    AsyncFunction("videoPackageStatus") { () async throws -> [String: Any] in
      let status = try await self.videoPackage.status()
      return ["installed": status.installed, "bytes": status.bytes]
    }
    AsyncFunction("installVideoPackage") { () async throws -> Void in try await self.videoPackage.install() }
    AsyncFunction("removeVideoPackage") { () async throws -> Void in try await self.videoPackage.remove() }
    AsyncFunction("videoPrepare") { (owner: String, generation: Int, sourceIndices: [Int], position: Double, rate: Double, promise: Promise) in
      MainActor.assumeIsolated {
        guard self.monitorLifetime.isOpen else { promise.reject("video-unavailable", "Video is unavailable."); return }
        let controller = LessonVideoPlayer.shared
        self.videoOwner = owner
        controller.reserve(owner: owner, generation: generation, position: position)
        controller.onStatus = { [weak self] status in
          guard let self, self.monitorLifetime.isOpen else { return }
          self.sendEvent("onVideoStatus", status)
        }
        Task { @MainActor in
          do {
            guard let manifest = self.videoPackage.manifest,
              (1...4).contains(sourceIndices.count),
              sourceIndices.allSatisfy({ manifest.phrases.indices.contains($0) }),
              zip(sourceIndices, sourceIndices.dropFirst()).allSatisfy({ $0.0 < $0.1 })
            else { throw VideoError.invalid }
            let url = try await self.videoPackage.mediaURL()
            guard self.monitorLifetime.isOpen, controller.matches(owner, generation) else { throw VideoError.cancelled }
            let segments = sourceIndices.map {
              VideoSegmentTimeline.Segment(start: manifest.phrases[$0].start, end: manifest.phrases[$0].end)
            }
            try await controller.prepare(url: url, segments: segments,
              position: position, rate: rate, owner: owner, generation: generation)
            promise.resolve()
          } catch {
            let code = controller.matches(owner, generation) ? "video-unavailable" : "video-cancelled"
            promise.reject(code, "Video could not be prepared.")
          }
        }
      }
    }.runOnQueue(.main)
    AsyncFunction("videoPlay") { (owner: String, generation: Int) in
      MainActor.assumeIsolated {
        guard self.monitorLifetime.isOpen else { return }
        LessonVideoPlayer.shared.play(owner: owner, generation: generation)
      }
    }.runOnQueue(.main)
    AsyncFunction("videoPause") { (owner: String) in
      MainActor.assumeIsolated { LessonVideoPlayer.shared.pause(owner: owner) }
    }.runOnQueue(.main)
    AsyncFunction("videoDispose") { (owner: String) in
      MainActor.assumeIsolated { LessonVideoPlayer.shared.dispose(owner: owner) }
    }.runOnQueue(.main)
    View(LessonVideoView.self) {}
    AsyncFunction("beginLessonRemote") { (owner: String) throws -> Void in
      try MainActor.assumeIsolated {
        guard self.monitorLifetime.isOpen else { throw LocalAudioError.invalidInput }
        if self.remote == nil {
          let remote = LessonRemoteControl()
          remote.onPress = { [weak self] event in
            guard let self, self.monitorLifetime.isOpen else { return }
            self.sendEvent("onLessonRemotePress", ["owner": event.owner, "revision": event.revision, "action": event.action.rawValue])
          }
          self.remote = remote
        }
        self.remote?.begin(owner)
        // A non-mixable active audio session plus transport handlers makes the
        // lesson eligible for Now Playing, instead of the last music app.
        do { try self.activateRemote(owner) }
        catch { _ = self.remote?.end(owner); throw error }
      }
    }.runOnQueue(.main)
    AsyncFunction("activateLessonRemote") { (owner: String) throws -> Void in
      try MainActor.assumeIsolated { try self.activateRemote(owner) }
    }.runOnQueue(.main)
    AsyncFunction("updateLessonRemote") { (owner: String, revision: String, actionable: Bool, playing: Bool) in
      MainActor.assumeIsolated {
        self.remote?.update(owner: owner, revision: revision, actionable: actionable, playing: playing)
      }
    }.runOnQueue(.main)
    AsyncFunction("updateLessonRemoteActions") { (owner: String, revision: String, actionable: Bool, repeatable: Bool, playing: Bool) in
      MainActor.assumeIsolated {
        self.remote?.update(owner: owner, revision: revision, actionable: actionable, repeatable: repeatable, playing: playing)
      }
    }.runOnQueue(.main)
    AsyncFunction("endLessonRemote") { (owner: String) throws -> Void in
      try MainActor.assumeIsolated {
        if self.remote?.end(owner) == true {
          self.monitor?.disable()
          try AVAudioSession.sharedInstance().setActive(false, options: .notifyOthersOnDeactivation)
        }
      }
    }.runOnQueue(.main)
    AsyncFunction("monitorStatus") { () throws -> [String: Any] in
      try MainActor.assumeIsolated { try self.monitoring().status }
    }.runOnQueue(.main)
    AsyncFunction("enableMonitor") { (promise: Promise) throws in
      let (service, request) = try MainActor.assumeIsolated {
        let service = try self.monitoring()
        return (service, service.queuedEnable())
      }
      Task { @MainActor in await request(); promise.resolve(service.status) }
    }.runOnQueue(.main)
    AsyncFunction("disableMonitor") { () throws -> Void in
      try MainActor.assumeIsolated {
        try self.monitoring().disable()
        // Explicit mic OFF does not abandon the lesson's headset buttons.
        // Hardware interruption callbacks do not take this reactivation path.
        if let owner = self.remote?.owner { try self.activateRemote(owner) }
      }
    }.runOnQueue(.main)
    AsyncFunction("configureLearningPlayback") { () throws -> Void in
      try MainActor.assumeIsolated { try self.monitoring().configurePlayback() }
    }.runOnQueue(.main)
    AsyncFunction("setMonitorGain") { (value: Float) throws in
      try MainActor.assumeIsolated { try self.monitoring().gain(value) }
    }.runOnQueue(.main)
    AsyncFunction("playMonitorSample") { (uri: String) throws in
      try MainActor.assumeIsolated { try self.monitoring().play(uri) }
    }.runOnQueue(.main)
    AsyncFunction("stopMonitorSample") { () throws -> Void in
      try MainActor.assumeIsolated { try self.monitoring().stopSample() }
    }.runOnQueue(.main)
    OnAppContextDestroys {
      self.destroyMonitoring()
    }
    OnDestroy {
      self.destroyMonitoring()
    }
    AsyncFunction("durations") { (uris: [String]) async throws -> [Double] in
      try await self.inspection.durations(uris)
    }
    AsyncFunction("testStageAccess") { () async -> Bool in
      await TestBuildAccess.verifiedAccess()
    }
  }
}
