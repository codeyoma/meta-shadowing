import AVFoundation
import Foundation

/// One original-video source, with native end bounds and no independent reward authority.
@MainActor final class LessonVideoPlayer {
  static let shared = LessonVideoPlayer()
  let player = AVPlayer()
  var onStatus: (([String: Any]) -> Void)?
  private(set) var owner = ""
  private var generation = 0
  private var start = 0.0, end = 0.0, rate: Float = 1
  private var active = false, completed = false, hasPlayed = false
  private var periodic: Any?
  private var notifications: [NSObjectProtocol] = []

  func matches(_ owner: String, _ generation: Int) -> Bool { self.owner == owner && self.generation == generation }
  func reserve(owner: String, generation: Int) {
    player.pause(); active = false; completed = false; hasPlayed = false
    clearObservers()
    self.owner = owner; self.generation = generation
  }
  private func clearObservers() {
    if let periodic { player.removeTimeObserver(periodic); self.periodic = nil }
    for token in notifications { NotificationCenter.default.removeObserver(token) }
    notifications = []
  }
  func prepare(url: URL, start: Double, end: Double, position: Double, rate: Double,
               owner: String, generation: Int) async throws {
    guard matches(owner, generation), url.isFileURL, start.isFinite, end.isFinite, position.isFinite,
      start >= 0, end > start, position >= 0, position <= end - start, rate.isFinite, (0.25...3).contains(rate)
    else { throw VideoError.invalid }
    let asset = AVURLAsset(url: url)
    let duration = try await asset.load(.duration).seconds
    guard matches(owner, generation) else { throw VideoError.cancelled }
    guard duration.isFinite, end <= duration + 0.05,
      !(try await asset.loadTracks(withMediaType: .video)).isEmpty else { throw VideoError.invalid }
    guard matches(owner, generation) else { throw VideoError.cancelled }
    self.start = start; self.end = end; self.rate = Float(rate)
    let item = AVPlayerItem(asset: asset)
    item.forwardPlaybackEndTime = CMTime(seconds: end, preferredTimescale: 60000)
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
    let sought = await player.seek(to: CMTime(seconds: start + position, preferredTimescale: 60000),
      toleranceBefore: .zero, toleranceAfter: .zero)
    guard matches(owner, generation), sought else { throw VideoError.cancelled }
    notifications.append(NotificationCenter.default.addObserver(forName: .AVPlayerItemDidPlayToEndTime,
      object: item, queue: .main) { [weak self] _ in
        MainActor.assumeIsolated {
          guard let self, self.matches(owner, generation) else { return }
          self.finish()
        }
      })
    notifications.append(NotificationCenter.default.addObserver(forName: .AVPlayerItemFailedToPlayToEndTime,
      object: item, queue: .main) { [weak self] _ in
        MainActor.assumeIsolated {
          guard let self, self.matches(owner, generation), self.active else { return }
          self.active = false; self.player.pause(); self.emit("failed")
        }
      })
    periodic = player.addPeriodicTimeObserver(forInterval: CMTime(seconds: 0.025, preferredTimescale: 60000),
      queue: .main) { [weak self] _ in
        MainActor.assumeIsolated {
          guard let self, self.matches(owner, generation), self.active else { return }
          if self.player.currentItem?.status == .failed {
            self.active = false; self.player.pause(); self.emit("failed")
          } else if self.player.currentTime().seconds >= self.end {
            self.finish()
          } else if self.player.timeControlStatus == .playing {
            self.hasPlayed = true; self.emit("playing")
          } else if self.hasPlayed && self.player.timeControlStatus == .paused {
            self.active = false; self.emit("paused")
          }
        }
      }
    emit("ready")
  }
  private func finish() {
    guard active, !completed else { return }
    active = false; completed = true; player.pause(); emit("ended")
  }
  func play(owner: String, generation: Int) {
    guard matches(owner, generation), player.currentItem?.status == .readyToPlay, !completed else { return }
    active = true; player.playImmediately(atRate: rate)
  }
  func pause(owner: String) {
    guard self.owner == owner else { return }
    player.pause(); active = false; generation += 1
    clearObservers()
  }
  func dispose(owner: String) {
    guard self.owner == owner else { return }
    pause(owner: owner); player.replaceCurrentItem(with: nil); self.owner = ""; onStatus = nil
  }
  private func emit(_ phase: String) {
    let raw = player.currentTime().seconds
    let position = completed ? end - start : max(0, min(end - start, raw.isFinite ? raw - start : 0))
    onStatus?(["owner": owner, "generation": generation, "phase": phase,
      "position": position, "duration": end - start])
  }
}
