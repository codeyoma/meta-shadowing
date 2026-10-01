import AVFoundation

/// Only microphone audio is amplified; the original 0...1 range retains its level.
@MainActor final class VoiceMonitorVoicePath {
    private let boost = AVAudioUnitEQ(numberOfBands: 0)
    private let volume = AVAudioMixerNode()
    init(engine: AVAudioEngine, input: AVAudioNode, format: AVAudioFormat) {
        boost.globalGain = 20 * log10(4)
        engine.attach(boost); engine.attach(volume); volume.outputVolume = 0
        engine.connect(input, to: boost, format: format)
        engine.connect(boost, to: volume, format: format)
        engine.connect(volume, to: engine.mainMixerNode, format: format)
    }
    func setGain(_ value: Float) {
        let gain = VoiceMonitoring.normalizedGain(value)
        // The mixer stays within 0...1; extra amplification belongs to this mic-only EQ.
        boost.globalGain = 20 * log10(4 * max(1, gain))
        volume.outputVolume = min(1, gain)
    }
}
