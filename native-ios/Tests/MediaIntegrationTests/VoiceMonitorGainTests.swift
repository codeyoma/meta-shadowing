import AVFoundation
import Testing
@testable import LearningMedia

/// Render only generated signals in memory; never access a microphone or save audio.
@MainActor @Suite(.serialized) struct VoiceMonitorGainTests {
    @Test func extendedGainDoublesMicrophoneAmplitudeWithoutBoostingMedia() throws {
        let graph = try GainRenderFixture()
        defer { graph.engine.stop() }
        let previousMaximum = try graph.output(gain: 1)
        #expect(abs(previousMaximum - 0.07) < 0.0002)
        let extendedMaximum = try graph.output(gain: 2)
        #expect(abs(extendedMaximum - 0.11) < 0.0002)
    }

    @Test(arguments: [(Float(0), Float(0.03)), (0.25, 0.04), (0.6, 0.054), (1, 0.07),
                      (1.5, 0.09), (2, 0.11), (3, 0.11), (-1, 0.03), (.nan, 0.04)])
    func gainAdjustmentFromBoostedLevelPreservesMuteAndLegacyAmplitude(_ gain: Float, _ expected: Float) throws {
        let graph = try GainRenderFixture()
        defer { graph.engine.stop() }
        _ = try graph.output(gain: 2)
        let output = try graph.output(gain: gain)
        #expect(abs(output - expected) < 0.0002)
    }
}

@MainActor private final class GainRenderFixture {
    let engine = AVAudioEngine()
    private let voice: VoiceMonitorVoicePath
    private let buffer: AVAudioPCMBuffer

    init() throws {
        let format = try #require(AVAudioFormat(standardFormatWithSampleRate: 44_100, channels: 1))
        let microphone = Self.signal(0.01, format: format)
        let media = Self.signal(0.03, format: format)
        engine.attach(microphone)
        engine.attach(media)
        voice = VoiceMonitorVoicePath(engine: engine, input: microphone, format: format)
        engine.connect(media, to: engine.mainMixerNode, format: format)
        engine.mainMixerNode.outputVolume = 1
        engine.connect(engine.mainMixerNode, to: engine.outputNode, format: format)
        try engine.enableManualRenderingMode(.offline, format: format, maximumFrameCount: 512)
        buffer = try #require(AVAudioPCMBuffer(pcmFormat: format, frameCapacity: 512))
        try engine.start()
    }

    func output(gain: Float) throws -> Float {
        voice.setGain(gain)
        // Let native parameter ramps settle before inspecting generated samples.
        for _ in 0..<40 {
            let status = try engine.renderOffline(512, to: buffer)
            try #require(status == .success)
        }
        let samples = try #require(buffer.floatChannelData)[0]
        let count = Int(buffer.frameLength)
        try #require(count > 0)
        return (0..<count).reduce(Float(0)) { $0 + samples[$1] } / Float(count)
    }

    private static func signal(_ value: Float, format: AVAudioFormat) -> AVAudioSourceNode {
        AVAudioSourceNode(format: format) { _, _, count, buffers in
            for buffer in UnsafeMutableAudioBufferListPointer(buffers) {
                guard let data = buffer.mData else { continue }
                let samples = data.assumingMemoryBound(to: Float.self)
                for index in 0..<Int(count) { samples[index] = value }
            }
            return noErr
        }
    }
}
