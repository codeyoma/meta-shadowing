import AVFoundation

/// Microphone-only amplification. The original sample bypasses this branch.
@MainActor
final class VoiceMonitorVoicePath {
  private let boost = AVAudioUnitEQ(numberOfBands: 0)
  private let volume = AVAudioMixerNode()

  init(engine: AVAudioEngine, input: AVAudioNode, format: AVAudioFormat) {
    // AVAudioMixerNode.outputVolume is limited to 0...1; use a native gain
    // stage for the 4x (+12.0412 dB) boost, leaving zero as a true mute.
    boost.globalGain = 20 * log10(4)
    engine.attach(boost)
    engine.attach(volume)
    volume.outputVolume = 0
    engine.connect(input, to: boost, format: format)
    engine.connect(boost, to: volume, format: format)
    engine.connect(volume, to: engine.mainMixerNode, format: format)
  }

  func setGain(_ value: Float) { volume.outputVolume = VoiceMonitorPolicy.gain(value) }
}
