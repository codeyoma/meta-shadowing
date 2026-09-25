import AVFoundation
import Foundation
#if os(iOS)
import UIKit
#endif

/// One original-video source, with native end bounds and no independent reward authority.
@MainActor final class LessonVideoPlayer {
  static let shared = LessonVideoPlayer()
  private(set) var player = AVPlayer()
  private var preparingPlayer: AVPlayer?
  private let layers = NSHashTable<AVPlayerLayer>.weakObjects()

  func attach(_ layer: AVPlayerLayer) {
    layers.add(layer)
    layer.player = player
  }

  private func cancelPreparation() {
    preparingPlayer?.pause()
    preparingPlayer?.currentItem?.cancelPendingSeeks()
    preparingPlayer = nil
  }
  var onStatus: (([String: Any]) -> Void)?
  private(set) var owner = ""
  private var generation = 0
  private var timeline: VideoSegmentTimeline?
  private var member = 0, memberRevision = 0
  private var transitioning = false
  private var rate: Float = 1
  private var active = false, completed = false, hasPlayed = false, prepared = false
  private var periodic: Any?
  private var notifications: [NSObjectProtocol] = []
  private var lifecycleObservers: [NSObjectProtocol] = []
  private var interruptible = false
  private var preparing = false
  private var requestedPosition = 0.0
  private let lifecycleNotifications: NotificationCenter
  private let transitionSeek: @MainActor (AVPlayer, CMTime) async -> Bool

  init(lifecycleNotifications: NotificationCenter = .default,
       transitionSeek: @escaping @MainActor (AVPlayer, CMTime) async -> Bool = { player, time in
    await player.seek(to: time, toleranceBefore: .zero, toleranceAfter: .zero)
  }) {
    self.transitionSeek = transitionSeek
    self.lifecycleNotifications = lifecycleNotifications
  }

  func matches(_ owner: String, _ generation: Int) -> Bool { self.owner == owner && self.generation == generation }
  func reserve(owner: String, generation: Int, position: Double = 0) {
    cancelPreparation()
    player.pause(); active = false; completed = false; hasPlayed = false; prepared = false
    transitioning = false; memberRevision += 1
    player.currentItem?.cancelPendingSeeks()
    clearObservers()
    self.owner = owner; self.generation = generation
    timeline = nil; requestedPosition = position; interruptible = true; preparing = true
    observeLifecycle()
  }
  private var foreground: Bool {
    #if os(iOS)
    UIApplication.shared.applicationState == .active
    #else
    true
    #endif
  }
  private func observeLifecycle() {
    #if os(iOS)
    guard lifecycleObservers.isEmpty else { return }
    for name in [UIApplication.willResignActiveNotification, UIApplication.didEnterBackgroundNotification,
                 AVAudioSession.interruptionNotification, AVAudioSession.routeChangeNotification,
                 AVAudioSession.mediaServicesWereLostNotification, AVAudioSession.mediaServicesWereResetNotification] {
      lifecycleObservers.append(lifecycleNotifications.addObserver(forName: name, object: nil, queue: .main) { [weak self] note in
        let interruption = note.userInfo?[AVAudioSessionInterruptionTypeKey] as? UInt
        let route = note.userInfo?[AVAudioSessionRouteChangeReasonKey] as? UInt
        MainActor.assumeIsolated {
          // Recovery never restarts playback. Our own audio-session category
          // setup is not a physical route change.
          if name == AVAudioSession.interruptionNotification,
             interruption == AVAudioSession.InterruptionType.ended.rawValue { return }
          if name == AVAudioSession.routeChangeNotification,
             route == AVAudioSession.RouteChangeReason.categoryChange.rawValue { return }
          self?.interrupt()
        }
      })
    }
    #endif
  }
  private func interrupt() {
    guard interruptible, !owner.isEmpty else { return }
    // Capture the old generation and selected-time boundary before retiring the
    // seek. JavaScript must receive the matching event even if it resumes later.
    let event = status("paused")
    pause(owner: owner)
    onStatus?(event)
  }
  private func clearObservers() {
    if let periodic { player.removeTimeObserver(periodic); self.periodic = nil }
    for token in notifications { NotificationCenter.default.removeObserver(token) }
    notifications = []
  }
  func prepare(url: URL, segments: [VideoSegmentTimeline.Segment], position: Double, rate: Double,
               owner: String, generation: Int) async throws {
    guard matches(owner, generation), url.isFileURL, rate.isFinite, (0.25...3).contains(rate)
    else { throw VideoError.invalid }
    guard foreground else { interrupt(); throw VideoError.cancelled }
    requestedPosition = position
    let timeline = try VideoSegmentTimeline(segments: segments)
    let location = try timeline.locate(position)
    let asset = AVURLAsset(url: url)
    let duration = try await asset.load(.duration).seconds
    guard matches(owner, generation) else { throw VideoError.cancelled }
    guard duration.isFinite, segments.last!.end <= duration + 0.05,
      !(try await asset.loadTracks(withMediaType: .video)).isEmpty else { throw VideoError.invalid }
    let audioTracks = try await asset.loadTracks(withMediaType: .audio)
    var hasDecodableAudio = false
    for track in audioTracks {
      if try await track.load(.isDecodable), !(try await track.load(.formatDescriptions)).isEmpty {
        hasDecodableAudio = true
        break
      }
    }
    guard matches(owner, generation) else { throw VideoError.cancelled }
    guard hasDecodableAudio else { throw VideoError.invalid }
    self.timeline = timeline; member = location.member; self.rate = Float(rate)
    let item = AVPlayerItem(asset: asset)
    item.forwardPlaybackEndTime = CMTime(seconds: segments[member].end, preferredTimescale: 60000)
    item.audioTimePitchAlgorithm = .timeDomain
    // Keep the last positioned player visible while the next item loads/seeks.
    // Binding a fresh item to the visible layer exposes its source-opening frame.
    let candidate = AVPlayer(playerItem: item)
    candidate.actionAtItemEnd = .pause
    candidate.allowsExternalPlayback = false
    preparingPlayer = candidate
    defer { if preparingPlayer === candidate { preparingPlayer = nil } }
    let deadline = ContinuousClock.now + .seconds(10)
    while item.status == .unknown && ContinuousClock.now < deadline {
      try await Task.sleep(for: .milliseconds(10))
      guard matches(owner, generation) else { throw VideoError.cancelled }
    }
    guard item.status == .readyToPlay else { throw VideoError.unavailable }
    let sought = await candidate.seek(to: CMTime(seconds: location.mediaSeconds, preferredTimescale: 60000),
      toleranceBefore: .zero, toleranceAfter: .zero)
    guard matches(owner, generation), sought else { throw VideoError.cancelled }
    guard foreground else { interrupt(); throw VideoError.cancelled }
    player = candidate
    CATransaction.begin()
    CATransaction.setDisableActions(true)
    for layer in layers.allObjects { layer.player = candidate }
    CATransaction.commit()
    observe(item: item, owner: owner, generation: generation)
    prepared = true; preparing = false
    emit("ready")
  }
  private func observe(item: AVPlayerItem, owner: String, generation: Int) {
    let revision = memberRevision
    notifications.append(NotificationCenter.default.addObserver(forName: .AVPlayerItemDidPlayToEndTime,
      object: item, queue: .main) { [weak self] _ in
        MainActor.assumeIsolated {
          guard let self, self.matches(owner, generation), self.memberRevision == revision else { return }
          self.finishMember()
        }
      })
    notifications.append(NotificationCenter.default.addObserver(forName: .AVPlayerItemFailedToPlayToEndTime,
      object: item, queue: .main) { [weak self] _ in
        MainActor.assumeIsolated {
          guard let self, self.matches(owner, generation), self.memberRevision == revision else { return }
          self.fail()
        }
      })
    periodic = player.addPeriodicTimeObserver(forInterval: CMTime(seconds: 0.025, preferredTimescale: 60000),
      queue: .main) { [weak self] _ in
        MainActor.assumeIsolated {
          guard let self, self.matches(owner, generation), self.memberRevision == revision,
            self.active, !self.transitioning else { return }
          if self.player.currentItem?.status == .failed {
            self.fail()
          } else if CMTimeCompare(self.player.currentTime(), item.forwardPlaybackEndTime) >= 0 {
            self.finishMember()
          } else if self.player.timeControlStatus == .playing {
            self.hasPlayed = true; self.emit("playing")
          } else if self.hasPlayed && self.player.timeControlStatus == .paused {
            self.interrupt()
          }
        }
      }
  }
  private func finishMember() {
    guard active, !completed, !transitioning, let timeline, let item = player.currentItem,
      CMTimeCompare(player.currentTime(), item.forwardPlaybackEndTime) >= 0 else { return }
    player.pause()
    if member == timeline.segments.count - 1 {
      active = false; interruptible = false; completed = true; emit("ended"); return
    }
    // Retire this member before awaiting its seek. Both AVFoundation end paths can fire.
    transitioning = true; memberRevision += 1; clearObservers()
    let owner = owner, generation = generation, revision = memberRevision
    let next = member + 1
    item.forwardPlaybackEndTime = CMTime(seconds: timeline.segments[next].end, preferredTimescale: 60000)
    emit("playing") // Persist the selected-time boundary, never the skipped source gap.
    Task { @MainActor [weak self] in
      guard let self, self.matches(owner, generation), self.memberRevision == revision, self.active else { return }
      let sought = await self.transitionSeek(self.player, CMTime(seconds: timeline.segments[next].start, preferredTimescale: 60000))
      guard self.matches(owner, generation), self.memberRevision == revision, self.active else { return }
      guard self.foreground else { self.interrupt(); return }
      self.transitioning = false
      guard sought, item.status == .readyToPlay else { self.fail(); return }
      self.member = next; self.hasPlayed = false
      self.observe(item: item, owner: owner, generation: generation)
      self.player.playImmediately(atRate: self.rate)
    }
  }
  private func fail() {
    guard active else { return }
    active = false; prepared = false; interruptible = false; player.pause(); emit("failed")
  }
  func play(owner: String, generation: Int) {
    guard matches(owner, generation), prepared, player.currentItem?.status == .readyToPlay, !completed else { return }
    guard foreground else { interrupt(); return }
    active = true; player.playImmediately(atRate: rate)
  }
  func pause(owner: String) {
    guard self.owner == owner else { return }
    cancelPreparation()
    player.pause(); active = false; prepared = false; preparing = false; interruptible = false; generation += 1
    memberRevision += 1; transitioning = false; player.currentItem?.cancelPendingSeeks()
    clearObservers()
  }
  func dispose(owner: String) {
    guard self.owner == owner else { return }
    pause(owner: owner); player.replaceCurrentItem(with: nil); self.owner = ""; onStatus = nil
    lifecycleObservers.forEach(lifecycleNotifications.removeObserver)
    lifecycleObservers.removeAll()
  }
  private func status(_ phase: String) -> [String: Any] {
    let raw = player.currentTime().seconds
    let position = preparing ? requestedPosition : timeline.map { timeline in
      completed ? timeline.duration : timeline.position(member: member,
        mediaSeconds: transitioning ? timeline.segments[member].end : raw)
    } ?? requestedPosition
    return ["owner": owner, "generation": generation, "phase": phase,
      "position": position, "duration": timeline?.duration ?? 0]
  }
  private func emit(_ phase: String) { onStatus?(status(phase)) }
}
