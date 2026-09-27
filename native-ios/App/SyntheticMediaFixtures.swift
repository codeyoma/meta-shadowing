#if DEBUG
import AVFoundation
import Foundation
import LearningMedia

/// Public-safe generated tones and solid frames; never speech, recordings or downloaded content.
enum SyntheticMediaFixtures {
    @concurrent static func create(in root: URL, video: Bool) async throws -> [MediaSource] {
        try FileManager.default.createDirectory(at: root, withIntermediateDirectories: true)
        if !video {
            return try ["media-probe-one", "media-probe-two"].map {
                .audio(file: try tone(root.appending(path: "\($0).wav"), duration: 2, compressed: false))
            }
        }
        let destination = root.appending(path: "media-probe-video.mov")
        if FileManager.default.fileExists(atPath: destination.path) {
            return [.video(file: destination, start: 0, end: 0.75), .video(file: destination, start: 2, end: 2.75)]
        }
        let raw = root.appending(path: "media-probe-\(UUID()).mp4")
        let writer = try AVAssetWriter(outputURL: raw, fileType: .mp4)
        let input = AVAssetWriterInput(mediaType: .video, outputSettings: [AVVideoCodecKey: AVVideoCodecType.h264, AVVideoWidthKey: 64, AVVideoHeightKey: 64])
        let adaptor = AVAssetWriterInputPixelBufferAdaptor(assetWriterInput: input, sourcePixelBufferAttributes: [
            kCVPixelBufferPixelFormatTypeKey as String: kCVPixelFormatType_32ARGB,
            kCVPixelBufferWidthKey as String: 64, kCVPixelBufferHeightKey as String: 64])
        writer.add(input)
        guard writer.startWriting() else { throw MediaFailure.unavailable }
        writer.startSession(atSourceTime: .zero)
        for frame in 0..<90 {
            let deadline = ContinuousClock.now + .seconds(5)
            while !input.isReadyForMoreMediaData, ContinuousClock.now < deadline { try await Task.sleep(for: .milliseconds(10)) }
            guard input.isReadyForMoreMediaData, let pool = adaptor.pixelBufferPool else { writer.cancelWriting(); throw MediaFailure.timedOut }
            var buffer: CVPixelBuffer?
            CVPixelBufferPoolCreatePixelBuffer(nil, pool, &buffer)
            guard let pixels = buffer else { throw MediaFailure.unavailable }
            CVPixelBufferLockBaseAddress(pixels, [])
            memset(CVPixelBufferGetBaseAddress(pixels), Int32(40 + frame), CVPixelBufferGetDataSize(pixels))
            CVPixelBufferUnlockBaseAddress(pixels, [])
            guard adaptor.append(pixels, withPresentationTime: CMTime(value: Int64(frame), timescale: 30)) else { throw MediaFailure.unavailable }
        }
        input.markAsFinished(); await writer.finishWriting()
        guard writer.status == .completed else { throw MediaFailure.unavailable }
        let audio = try tone(root.appending(path: "media-probe-track.m4a"), duration: 3, compressed: true)
        let composition = AVMutableComposition()
        for (url, type) in [(raw, AVMediaType.video), (audio, AVMediaType.audio)] {
            let asset = AVURLAsset(url: url)
            guard let source = try await asset.loadTracks(withMediaType: type).first,
                  let track = composition.addMutableTrack(withMediaType: type, preferredTrackID: kCMPersistentTrackID_Invalid) else { throw MediaFailure.unavailable }
            try withExtendedLifetime(asset) {
                try track.insertTimeRange(.init(start: .zero, duration: CMTime(seconds: 2.9, preferredTimescale: 600)), of: source, at: .zero)
            }
        }
        guard let export = AVAssetExportSession(asset: composition, presetName: AVAssetExportPresetPassthrough) else { throw MediaFailure.unavailable }
        try await export.export(to: destination, as: .mov)
        return [.video(file: destination, start: 0, end: 0.75), .video(file: destination, start: 2, end: 2.75)]
    }
    nonisolated private static func tone(_ url: URL, duration: Double, compressed: Bool) throws -> URL {
        if FileManager.default.fileExists(atPath: url.path) { return url }
        guard let format = AVAudioFormat(standardFormatWithSampleRate: 44_100, channels: 1),
              let buffer = AVAudioPCMBuffer(pcmFormat: format, frameCapacity: AVAudioFrameCount(duration * 44_100)),
              let channel = buffer.floatChannelData?[0] else { throw MediaFailure.unavailable }
        buffer.frameLength = buffer.frameCapacity
        for index in 0..<Int(buffer.frameLength) { channel[index] = 0.03 * sin(Float(index) * 2 * .pi * 440 / 44_100) }
        let settings: [String: Any] = compressed ? [AVFormatIDKey: kAudioFormatMPEG4AAC, AVSampleRateKey: 44_100, AVNumberOfChannelsKey: 1, AVEncoderBitRateKey: 64_000] : format.settings
        try AVAudioFile(forWriting: url, settings: settings).write(from: buffer)
        return url
    }
}
#endif
