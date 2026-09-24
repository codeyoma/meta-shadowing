import AVFoundation
import Foundation
import Testing

struct LessonVideoTests {
  func movie() async throws -> URL {
    let url = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString + ".mp4")
    let writer = try AVAssetWriter(outputURL: url, fileType: .mp4)
    let input = AVAssetWriterInput(mediaType: .video, outputSettings: [
      AVVideoCodecKey: AVVideoCodecType.h264, AVVideoWidthKey: 64, AVVideoHeightKey: 64])
    let adaptor = AVAssetWriterInputPixelBufferAdaptor(assetWriterInput: input, sourcePixelBufferAttributes: [
      kCVPixelBufferPixelFormatTypeKey as String: kCVPixelFormatType_32ARGB,
      kCVPixelBufferWidthKey as String: 64, kCVPixelBufferHeightKey as String: 64])
    writer.add(input); writer.startWriting(); writer.startSession(atSourceTime: .zero)
    for frame in 0..<90 {
      while !input.isReadyForMoreMediaData { try await Task.sleep(for: .milliseconds(5)) }
      var buffer: CVPixelBuffer?
      CVPixelBufferPoolCreatePixelBuffer(nil, try #require(adaptor.pixelBufferPool), &buffer)
      let pixels = try #require(buffer)
      CVPixelBufferLockBaseAddress(pixels, [])
      memset(CVPixelBufferGetBaseAddress(pixels), Int32(frame * 2), CVPixelBufferGetDataSize(pixels))
      CVPixelBufferUnlockBaseAddress(pixels, [])
      #expect(adaptor.append(pixels, withPresentationTime: CMTime(value: Int64(frame), timescale: 30)))
    }
    input.markAsFinished(); await writer.finishWriting()
    #expect(writer.status == .completed)
    let tone = url.deletingPathExtension().appendingPathExtension("m4a")
    let combined = url.deletingPathExtension().appendingPathExtension("mov")
    defer { try? FileManager.default.removeItem(at: url); try? FileManager.default.removeItem(at: tone) }
    try LocalAudioTests().tone(tone, frequency: 440, seconds: 3)
    let composition = AVMutableComposition()
    for (asset, type) in [(AVURLAsset(url: url), AVMediaType.video), (AVURLAsset(url: tone), AVMediaType.audio)] {
      let track = try #require(try await asset.loadTracks(withMediaType: type).first)
      let destination = try #require(composition.addMutableTrack(withMediaType: type, preferredTrackID: kCMPersistentTrackID_Invalid))
      try destination.insertTimeRange(CMTimeRange(start: .zero, duration: CMTime(seconds: 2.9, preferredTimescale: 600)), of: track, at: .zero)
    }
    let exporter = try #require(AVAssetExportSession(asset: composition, presetName: AVAssetExportPresetPassthrough))
    try await exporter.export(to: combined, as: .mov)
    return combined
  }
  @Test @MainActor func stopsAtSegmentEndAndRetainsFrameUntilReplay() async throws {
    let url = try await movie()
    defer { try? FileManager.default.removeItem(at: url) }
    let video = LessonVideoPlayer()
    defer { video.dispose(owner: "test") }
    var ends = 0
    video.onStatus = { event in if event["phase"] as? String == "ended" { ends += 1 } }
    video.reserve(owner: "test", generation: 1)
    try await video.prepare(url: url, start: 1, end: 1.5, position: 0, rate: 2, owner: "test", generation: 1)
    let item = try #require(video.player.currentItem)
    #expect(try await item.asset.loadTracks(withMediaType: .audio).count == 1)
    let output = AVPlayerItemVideoOutput(pixelBufferAttributes: [kCVPixelBufferPixelFormatTypeKey as String: kCVPixelFormatType_32BGRA])
    item.add(output)
    video.play(owner: "test", generation: 1)
    let deadline = ContinuousClock.now + .seconds(5)
    while ends == 0 && ContinuousClock.now < deadline { try await Task.sleep(for: .milliseconds(10)) }
    #expect(ends == 1)
    #expect(video.player.rate == 0)
    #expect(video.player.currentItem != nil)
    #expect(abs(video.player.currentTime().seconds - 1.5) < 0.05)
    #expect(output.copyPixelBuffer(forItemTime: CMTime(seconds: 1.49, preferredTimescale: 60000), itemTimeForDisplay: nil) != nil)
    try await Task.sleep(for: .milliseconds(100))
    #expect(video.player.rate == 0)
    #expect(abs(video.player.currentTime().seconds - 1.5) < 0.05)
    video.reserve(owner: "test", generation: 2)
    try await video.prepare(url: url, start: 1, end: 1.5, position: 0.2, rate: 1, owner: "test", generation: 2)
    #expect(abs(video.player.currentTime().seconds - 1.2) < 0.05)
    video.reserve(owner: "test", generation: 3)
    try await video.prepare(url: url, start: 1, end: 1.5, position: 0, rate: 1, owner: "test", generation: 3)
    #expect(abs(video.player.currentTime().seconds - 1) < 0.01)
    video.dispose(owner: "obsolete-owner")
    #expect(video.player.currentItem != nil)
  }
  @Test @MainActor func cancellationCannotPrepareOrStartAnOldSegment() async throws {
    let url = try await movie()
    defer { try? FileManager.default.removeItem(at: url) }
    let video = LessonVideoPlayer()
    defer { video.dispose(owner: "test") }
    video.reserve(owner: "test", generation: 1)
    let task = Task { @MainActor in
      try await video.prepare(url: url, start: 0, end: 1, position: 0, rate: 1, owner: "test", generation: 1)
    }
    video.pause(owner: "test")
    await #expect(throws: (any Error).self) { try await task.value }
    video.play(owner: "test", generation: 1)
    #expect(video.player.rate == 0)
  }
  @Test @MainActor func invalidMediaNeverStartsPlayback() async throws {
    let url = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString + ".mp4")
    try Data("not a movie".utf8).write(to: url)
    defer { try? FileManager.default.removeItem(at: url) }
    let video = LessonVideoPlayer()
    video.reserve(owner: "invalid", generation: 1)
    await #expect(throws: (any Error).self) {
      try await video.prepare(url: url, start: 0, end: 1, position: 0, rate: 1, owner: "invalid", generation: 1)
    }
    video.play(owner: "invalid", generation: 1)
    #expect(video.player.rate == 0)
    video.dispose(owner: "invalid")
  }
}
