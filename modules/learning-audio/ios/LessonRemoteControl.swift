#if os(iOS)
import AVFoundation
import MediaPlayer
import UIKit

/// Own transport commands for the mounted lesson, including its temporary menus.
/// No silent player, microphone request, or automatic learning confirmation.
@MainActor
final class LessonRemoteControl {
  private var state = LessonRemoteState()
  private var targets: [(MPRemoteCommand, Any)] = []
  private var foregroundSince = ProcessInfo.processInfo.systemUptime
  private var foregroundObserver: NSObjectProtocol?
  var onPress: ((LessonRemoteEvent) -> Void)?
  var owner: String? { state.owner }

  init() {
    foregroundObserver = NotificationCenter.default.addObserver(forName: UIApplication.didBecomeActiveNotification,
      object: nil, queue: .main) { [weak self] _ in
        MainActor.assumeIsolated { self?.foregroundSince = ProcessInfo.processInfo.systemUptime }
      }
  }

  func begin(_ owner: String) {
    state.begin(owner)
    if targets.isEmpty {
      let center = MPRemoteCommandCenter.shared()
      // A headset click can arrive as play, pause, or toggle depending on iOS's
      // current transport state. Consume all three, even while action is gated.
      let commands: [(MPRemoteCommand, LessonRemoteAction)] = [
        (center.playCommand, .main), (center.pauseCommand, .main),
        (center.togglePlayPauseCommand, .main), (center.nextTrackCommand, .repeatPractice),
      ]
      // EarPods report a quick double-press as next-track, not two play events.
      for (command, action) in commands {
        command.isEnabled = true
        let target = command.addTarget { [weak self] _ in
          // Use the same monotonic clock as action publication and foreground
          // transitions, capturing receipt before any main-queue handoff.
          let time = ProcessInfo.processInfo.systemUptime
          if Thread.isMainThread {
            return MainActor.assumeIsolated { self?.handle(action, at: time) ?? .commandFailed }
          }
          return DispatchQueue.main.sync { self?.handle(action, at: time) ?? .commandFailed }
        }
        targets.append((command, target))
      }
    }
    publish(playing: false)
  }

  func update(owner: String, revision: String, actionable: Bool, repeatable: Bool = false, playing: Bool) {
    guard state.owner == owner else { return }
    state.update(owner: owner, revision: revision, actionable: actionable, repeatable: repeatable,
      since: ProcessInfo.processInfo.systemUptime)
    publish(playing: playing)
  }

  private func handle(_ action: LessonRemoteAction, at time: TimeInterval) -> MPRemoteCommandHandlerStatus {
    guard state.owner != nil else { return .commandFailed }
    let outputs = AVAudioSession.sharedInstance().currentRoute.outputs
    let wired = outputs.count == 1 && outputs.first?.portType == .headphones
    if let event = state.take(action: action, at: time,
      foreground: UIApplication.shared.applicationState == .active && time >= foregroundSince, wired: wired) {
      onPress?(event)
    }
    // A disabled lesson action must not become a play/pause operation elsewhere.
    return .success
  }

  private func publish(playing: Bool) {
    MPNowPlayingInfoCenter.default().nowPlayingInfo = [
      MPMediaItemPropertyTitle: "메타쉐도잉 학습",
      MPMediaItemPropertyArtist: "한 번 · 확인/다음 | 두 번 · 두 번 더 연습",
      MPNowPlayingInfoPropertyPlaybackRate: playing ? 1.0 : 0.0,
      MPNowPlayingInfoPropertyIsLiveStream: true,
    ]
  }

  func end(_ owner: String) -> Bool {
    guard state.end(owner) else { return false }
    clear()
    return true
  }

  func shutdown() {
    if let owner = state.owner { state.end(owner) }
    clear()
    onPress = nil
    if let foregroundObserver { NotificationCenter.default.removeObserver(foregroundObserver) }
    foregroundObserver = nil
  }

  private func clear() {
    guard !targets.isEmpty else { return }
    for (command, target) in targets {
      command.removeTarget(target)
      command.isEnabled = false
    }
    targets.removeAll()
    MPNowPlayingInfoCenter.default().nowPlayingInfo = nil
  }
}
#endif
