#if os(iOS)
import AVFoundation

@MainActor final class SystemAudioSessionHardware: AudioSessionHardware {
    func configure(_ mode: LessonAudioMode) throws {
        let session = AVAudioSession.sharedInstance()
        switch mode {
        case .playback: try session.setCategory(.playback, mode: .default, options: [])
        case .monitoring:
            try session.setCategory(.playAndRecord, mode: .default, options: [])
            try session.setPreferredIOBufferDuration(0.005)
            try session.setAllowHapticsAndSystemSoundsDuringRecording(true)
        }
    }
    func activate() throws { try AVAudioSession.sharedInstance().setActive(true) }
    func deactivate() { try? AVAudioSession.sharedInstance().setActive(false, options: .notifyOthersOnDeactivation) }
}

extension LessonAudioSession {
    public convenience init() { self.init(hardware: SystemAudioSessionHardware()) }
}
#endif
