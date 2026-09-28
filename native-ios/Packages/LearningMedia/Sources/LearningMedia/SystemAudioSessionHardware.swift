#if os(iOS)
import AVFoundation

@MainActor final class SystemAudioSessionHardware: AudioSessionHardware {
    func apply(_ mode: LessonAudioMode?) async throws { try await Self.transition(mode) }
    @concurrent private static func transition(_ mode: LessonAudioMode?) async throws {
        let session = AVAudioSession.sharedInstance()
        guard let mode else {
            if #available(iOS 27, *) {
                guard try await session.deactivate(options: .notifyOthersOnDeactivation) else { throw MediaFailure.unavailable }
            } else { try session.setActive(false, options: .notifyOthersOnDeactivation) }
            return
        }
        switch mode {
        case .playback: try session.setCategory(.playback, mode: .default, options: [])
        case .monitoring:
            try session.setCategory(.playAndRecord, mode: .default, options: [])
            try session.setPreferredIOBufferDuration(0.005)
            try session.setAllowHapticsAndSystemSoundsDuringRecording(true)
        }
        if #available(iOS 27, *) {
            guard try await session.activate() else { throw MediaFailure.unavailable }
        } else { try session.setActive(true) }
    }
}

extension LessonAudioSession {
    public convenience init() { self.init(hardware: SystemAudioSessionHardware()) }
}
#endif
