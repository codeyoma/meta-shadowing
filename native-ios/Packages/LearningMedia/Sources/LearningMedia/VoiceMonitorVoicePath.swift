import AVFoundation

/// Reuses the reference graph: only microphone audio receives the fourfold gain.
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
    func setGain(_ value: Float) { volume.outputVolume = value.isFinite ? min(1, max(0, value)) : 0.25 }
}
