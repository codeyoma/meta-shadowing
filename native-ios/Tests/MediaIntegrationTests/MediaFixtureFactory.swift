import AVFoundation
import Foundation
import LearningDomain
import LearningMedia
import Testing

enum MediaFixtureFactory {
    @MainActor static func movie(in root: URL, includeAudio: Bool = true) async throws -> URL {
        let video = root.appending(path: "video-\(UUID()).mp4")
        let writer = try AVAssetWriter(outputURL: video, fileType: .mp4)
        let input = AVAssetWriterInput(mediaType: .video, outputSettings: [
            AVVideoCodecKey: AVVideoCodecType.h264, AVVideoWidthKey: 64, AVVideoHeightKey: 64])
        let adaptor = AVAssetWriterInputPixelBufferAdaptor(assetWriterInput: input, sourcePixelBufferAttributes: [
            kCVPixelBufferPixelFormatTypeKey as String: kCVPixelFormatType_32ARGB,
            kCVPixelBufferWidthKey as String: 64, kCVPixelBufferHeightKey as String: 64])
        writer.add(input)
        #expect(writer.startWriting())
        writer.startSession(atSourceTime: .zero)
        for frame in 0..<240 {
            try await waitForMedia { input.isReadyForMoreMediaData }
            var buffer: CVPixelBuffer?
            CVPixelBufferPoolCreatePixelBuffer(nil, try #require(adaptor.pixelBufferPool), &buffer)
            let pixels = try #require(buffer)
            CVPixelBufferLockBaseAddress(pixels, [])
            memset(CVPixelBufferGetBaseAddress(pixels), Int32(frame % 200), CVPixelBufferGetDataSize(pixels))
            CVPixelBufferUnlockBaseAddress(pixels, [])
            #expect(adaptor.append(pixels, withPresentationTime: CMTime(value: Int64(frame), timescale: 30)))
        }
        input.markAsFinished()
        await writer.finishWriting()
        #expect(writer.status == .completed)
        if !includeAudio { return video }
        let audio = try tone(in: root, name: "sound-\(UUID())", duration: 8, compressed: true)
        let composition = AVMutableComposition()
        for (url, type) in [(video, AVMediaType.video), (audio, AVMediaType.audio)] {
            let asset = AVURLAsset(url: url)
            let source = try #require(try await asset.loadTracks(withMediaType: type).first)
            let track = try #require(composition.addMutableTrack(withMediaType: type, preferredTrackID: kCMPersistentTrackID_Invalid))
            do {
                try withExtendedLifetime(asset) {
                    try track.insertTimeRange(CMTimeRange(start: .zero, duration: CMTime(seconds: 7.9, preferredTimescale: 600)), of: source, at: .zero)
                }
            } catch { Issue.record("Fixture track insertion failed: \(type.rawValue)"); throw error }
        }
        let destination = root.appending(path: "fixture-\(UUID()).mov")
        let export = try #require(AVAssetExportSession(asset: composition, presetName: AVAssetExportPresetPassthrough))
        do { try await export.export(to: destination, as: .mov) }
        catch { Issue.record("Fixture movie export failed"); throw error }
        return destination
    }

    static func root() throws -> URL {
        let root = URL.temporaryDirectory.appending(path: "native-media-fixture-\(UUID())")
        try FileManager.default.createDirectory(at: root, withIntermediateDirectories: true)
        // iOS temporary directories may use an alias that missing fixture files cannot resolve.
        // Canonicalize the existing parent before deriving unmaterialized media references.
        return root.standardizedFileURL.resolvingSymlinksInPath()
    }

    static func tone(in root: URL, name: String = "tone", duration: Double = 0.25, compressed: Bool = false) throws -> URL {
        let url = root.appending(path: "\(name).\(compressed ? "m4a" : "wav")")
        let format = try #require(AVAudioFormat(standardFormatWithSampleRate: 44_100, channels: 1))
        let frames = AVAudioFrameCount(duration * 44_100)
        let buffer = try #require(AVAudioPCMBuffer(pcmFormat: format, frameCapacity: frames))
        buffer.frameLength = frames
        let channel = try #require(buffer.floatChannelData?[0])
        for index in 0..<Int(frames) {
            channel[index] = 0.03 * sin(Float(index) * 2 * .pi * 440 / 44_100)
        }
        let settings: [String: Any] = compressed ? [AVFormatIDKey: kAudioFormatMPEG4AAC,
            AVSampleRateKey: 44_100, AVNumberOfChannelsKey: 1, AVEncoderBitRateKey: 64_000] : format.settings
        let file = try AVAudioFile(forWriting: url, settings: settings)
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
