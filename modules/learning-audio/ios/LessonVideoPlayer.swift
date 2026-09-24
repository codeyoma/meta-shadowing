import AVFoundation
import Foundation

/// One original-video source, with native end bounds and no independent reward authority.
@MainActor final class LessonVideoPlayer {
  static let shared = LessonVideoPlayer()
  let player = AVPlayer()
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
  private let transitionSeek: @MainActor (AVPlayer, CMTime) async -> Bool

  init(transitionSeek: @escaping @MainActor (AVPlayer, CMTime) async -> Bool = { player, time in
    await player.seek(to: time, toleranceBefore: .zero, toleranceAfter: .zero)
  }) {
    self.transitionSeek = transitionSeek
  }

  func matches(_ owner: String, _ generation: Int) -> Bool { self.owner == owner && self.generation == generation }
  func reserve(owner: String, generation: Int) {
    player.pause(); active = false; completed = false; hasPlayed = false; prepared = false
    transitioning = false; memberRevision += 1
    player.currentItem?.cancelPendingSeeks()
    clearObservers()
    self.owner = owner; self.generation = generation
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
    player.actionAtItemEnd = .pause
    player.allowsExternalPlayback = false
    player.replaceCurrentItem(with: item)
    let deadline = ContinuousClock.now + .seconds(10)
    while item.status == .unknown && ContinuousClock.now < deadline {
      try await Task.sleep(for: .milliseconds(10))
      guard matches(owner, generation) else { throw VideoError.cancelled }
    }
    guard item.status == .readyToPlay else { throw VideoError.unavailable }
    let sought = await player.seek(to: CMTime(seconds: location.mediaSeconds, preferredTimescale: 60000),
      toleranceBefore: .zero, toleranceAfter: .zero)
    guard matches(owner, generation), sought else { throw VideoError.cancelled }
    observe(item: item, owner: owner, generation: generation)
    prepared = true
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
            self.active = false; self.emit("paused")
          }
        }
      }
  }
  private func finishMember() {
    guard active, !completed, !transitioning, let timeline, let item = player.currentItem,
      CMTimeCompare(player.currentTime(), item.forwardPlaybackEndTime) >= 0 else { return }
    player.pause()
    if member == timeline.segments.count - 1 {
      active = false; completed = true; emit("ended"); return
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
      self.transitioning = false
      guard sought, item.status == .readyToPlay else { self.fail(); return }
      self.member = next; self.hasPlayed = false
      self.observe(item: item, owner: owner, generation: generation)
      self.player.playImmediately(atRate: self.rate)
    }
  }
  private func fail() {
    guard active else { return }
    active = false; prepared = false; player.pause(); emit("failed")
  }
  func play(owner: String, generation: Int) {
    guard matches(owner, generation), prepared, player.currentItem?.status == .readyToPlay, !completed else { return }
    active = true; player.playImmediately(atRate: rate)
  }
  func pause(owner: String) {
    guard self.owner == owner else { return }
    player.pause(); active = false; prepared = false; generation += 1
    memberRevision += 1; transitioning = false; player.currentItem?.cancelPendingSeeks()
    clearObservers()
  }
  func dispose(owner: String) {
    guard self.owner == owner else { return }
    pause(owner: owner); player.replaceCurrentItem(with: nil); self.owner = ""; onStatus = nil
  }
  private func emit(_ phase: String) {
    guard let timeline else { return }
    let raw = player.currentTime().seconds
    let position = completed ? timeline.duration : timeline.position(member: member,
      mediaSeconds: transitioning ? timeline.segments[member].end : raw)
    onStatus?(["owner": owner, "generation": generation, "phase": phase,
      "position": position, "duration": timeline.duration])
  }
}
