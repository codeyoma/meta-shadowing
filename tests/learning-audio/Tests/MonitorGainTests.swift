import AVFoundation
import Testing

struct MonitorGainTests {
  // Synthetic buffers only: this test never accesses or records a microphone.
  @Test @MainActor func voiceIsQuadrupledWithoutBoostingTheSampleAndZeroStillMutes() throws {
    for (gain, expected) in [(Float(1), Float(0.45)), (0.5, 0.25), (0, 0.05)] {
      let engine = AVAudioEngine()
      // Match stereo output explicitly so this isolates gain from mono panning.
      let format = try #require(AVAudioFormat(standardFormatWithSampleRate: 44100, channels: 2))
      let source = AVAudioPlayerNode()
      let sample = AVAudioPlayerNode()
      engine.attach(source)
      engine.attach(sample)
      let voice = VoiceMonitorVoicePath(engine: engine, input: source, format: format)
      voice.setGain(gain)
      engine.connect(sample, to: engine.mainMixerNode, format: format)
      try engine.enableManualRenderingMode(.offline, format: format, maximumFrameCount: 4096)
      let input = try #require(AVAudioPCMBuffer(pcmFormat: format, frameCapacity: 16384))
      let original = try #require(AVAudioPCMBuffer(pcmFormat: format, frameCapacity: 16384))
      input.frameLength = 16384
      original.frameLength = 16384
      for index in 0..<16384 {
        for channel in 0..<2 {
          input.floatChannelData![channel][index] = 0.1
          original.floatChannelData![channel][index] = 0.05
        }
      }
      source.scheduleBuffer(input)
      sample.scheduleBuffer(original)
      try engine.start()
      defer { engine.stop() }
      source.play()
      sample.play()
      let output = try #require(AVAudioPCMBuffer(pcmFormat: format, frameCapacity: 4096))
      // Discard the first quantum to exclude parameter smoothing at startup.
      #expect(try engine.renderOffline(4096, to: output) == .success)
      #expect(try engine.renderOffline(4096, to: output) == .success)
      let channel = try #require(output.floatChannelData?[0])
      let mean = (0..<Int(output.frameLength)).reduce(Float(0)) { $0 + channel[$1] } / Float(output.frameLength)
      #expect(abs(mean - expected) < 0.002, "gain=\(gain), rendered=\(mean), expected=\(expected)")
    }
  }
}
