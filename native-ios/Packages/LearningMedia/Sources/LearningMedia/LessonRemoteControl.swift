#if os(iOS)
import AVFoundation
import MediaPlayer
import UIKit

/// Adapted from the reference remote lease. No silent player or microphone request.
@MainActor public final class LessonRemoteControl {
    public var onPress: (@MainActor (LessonRemoteEvent) -> Void)?
    private let session: LessonAudioSession
    private var state = LessonRemoteState()
    private var targets: [(MPRemoteCommand, Any)] = []
    private var closed = false
    private var foregroundSince = ProcessInfo.processInfo.systemUptime
    private var foregroundObserver: (any NSObjectProtocol)?
    public init(session: LessonAudioSession) {
        self.session = session
        foregroundObserver = NotificationCenter.default.addObserver(forName: UIApplication.didBecomeActiveNotification,
            object: nil, queue: .main) { [weak self] _ in
            MainActor.assumeIsolated { self?.foregroundSince = ProcessInfo.processInfo.systemUptime }
        }
    }
    public func begin(_ owner: String) throws {
        guard !closed else { throw MediaFailure.cancelled }
        try session.setRemoteOwnership(true)
        state.begin(owner)
        guard targets.isEmpty else { return }
        let center = MPRemoteCommandCenter.shared()
        let commands: [(MPRemoteCommand, LessonRemoteAction)] = [(center.playCommand, .main),
            (center.pauseCommand, .main), (center.togglePlayPauseCommand, .main), (center.nextTrackCommand, .repeatPractice)]
        for (command, action) in commands {
            command.isEnabled = true
            let target = command.addTarget { [weak self] _ in
                let time = ProcessInfo.processInfo.systemUptime
                if Thread.isMainThread { return MainActor.assumeIsolated { self?.handle(action, at: time) ?? .commandFailed } }
                return DispatchQueue.main.sync { self?.handle(action, at: time) ?? .commandFailed }
            }
            targets.append((command, target))
        }
    }
    public func update(owner: String, revision: String, actionable: Bool, repeatable: Bool, playing: Bool) {
        guard state.owner == owner else { return }
        state.update(owner: owner, revision: revision, actionable: actionable, repeatable: repeatable, since: ProcessInfo.processInfo.systemUptime)
        MPNowPlayingInfoCenter.default().nowPlayingInfo = [MPMediaItemPropertyTitle: "메타쉐도잉 학습",
            MPMediaItemPropertyArtist: "한 번 · 확인/다음 | 두 번 · 두 번 더 연습",
            MPNowPlayingInfoPropertyPlaybackRate: playing ? 1.0 : 0.0, MPNowPlayingInfoPropertyIsLiveStream: true]
    }
    private func handle(_ action: LessonRemoteAction, at time: Double) -> MPRemoteCommandHandlerStatus {
        guard state.owner != nil else { return .commandFailed }
        let outputs = AVAudioSession.sharedInstance().currentRoute.outputs
        if let event = state.take(action: action, at: time,
            foreground: UIApplication.shared.applicationState == .active && time >= foregroundSince,
            wired: outputs.count == 1 && outputs.first?.portType == .headphones) { onPress?(event) }
        return .success
    }
    public func close() {
        guard !closed else { return }
        closed = true
        let owned = state.owner != nil
        if let owner = state.owner { state.end(owner) }
        for (command, target) in targets { command.removeTarget(target); command.isEnabled = false }
        targets = []
        if owned { MPNowPlayingInfoCenter.default().nowPlayingInfo = nil }
        if let foregroundObserver { NotificationCenter.default.removeObserver(foregroundObserver) }
        foregroundObserver = nil; onPress = nil
        if owned { try? session.setRemoteOwnership(false) }
    }
}
#endif
