import AVFoundation
import Foundation
import LearningDomain
import LearningMedia
import Testing

enum MediaFixtureFactory {
    static func root() throws -> URL {
        let root = URL.temporaryDirectory.appending(path: "native-media-fixture-\(UUID())")
        try FileManager.default.createDirectory(at: root, withIntermediateDirectories: true)
        return root
    }

    static func tone(in root: URL, name: String = "tone", duration: Double = 0.25) throws -> URL {
        let url = root.appending(path: "\(name).wav")
        let format = try #require(AVAudioFormat(standardFormatWithSampleRate: 44_100, channels: 1))
        let frames = AVAudioFrameCount(duration * 44_100)
        let buffer = try #require(AVAudioPCMBuffer(pcmFormat: format, frameCapacity: frames))
        buffer.frameLength = frames
        let channel = try #require(buffer.floatChannelData?[0])
        for index in 0..<Int(frames) {
            channel[index] = 0.03 * sin(Float(index) * 2 * .pi * 440 / 44_100)
        }
        let file = try AVAudioFile(forWriting: url, settings: format.settings)
        try file.write(from: buffer)
        return url
    }

    static func token() -> TransportToken {
        TransportToken(writerID: UUID(), planID: "fixture", unit: 0, cycle: 1, generation: UUID())
    }
}

@MainActor
func waitForMedia(timeout: Double = 5, _ condition: () -> Bool) async throws {
    let deadline = ContinuousClock.now + .seconds(timeout)
    while !condition(), ContinuousClock.now < deadline { try await Task.sleep(for: .milliseconds(20)) }
    #expect(condition(), "Expected media event before the bounded fixture deadline")
}
