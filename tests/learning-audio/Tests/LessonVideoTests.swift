import AVFoundation
import Foundation
import Testing
#if os(iOS)
import UIKit
#endif

@Suite(.serialized) struct LessonVideoTests {
  #if os(iOS)
  @Test @MainActor func interruptionRetiresReservedPreparationAndRequiresANewExplicitRequest() async throws {
    let url = try await movie()
    defer { try? FileManager.default.removeItem(at: url) }
    let notifications = NotificationCenter()
    let video = LessonVideoPlayer(lifecycleNotifications: notifications)
    defer { video.dispose(owner: "pending") }
    var events: [[String: Any]] = []
    video.onStatus = { events.append($0) }
    video.reserve(owner: "pending", generation: 1, position: 0.3)
    notifications.post(name: UIApplication.willResignActiveNotification, object: nil)
    notifications.post(name: UIApplication.didEnterBackgroundNotification, object: nil)
    #expect(events.count == 1)
    #expect(events.first?["position"] as? Double == 0.3)
    #expect(events.first?["generation"] as? Int == 1)
    await #expect(throws: (any Error).self) {
      try await video.prepare(url: url, segments: [.init(start: 1, end: 2)], position: 0.3,
        rate: 1, owner: "pending", generation: 1)
    }
    video.reserve(owner: "pending", generation: 3, position: 0.3)
    try await video.prepare(url: url, segments: [.init(start: 1, end: 2)], position: 0.3,
      rate: 1, owner: "pending", generation: 3)
    notifications.post(name: AVAudioSession.routeChangeNotification, object: nil,
      userInfo: [AVAudioSessionRouteChangeReasonKey: AVAudioSession.RouteChangeReason.categoryChange.rawValue])
    #expect(video.matches("pending", 3))
    #expect(video.player.rate == 0)
    #expect(abs(video.player.currentTime().seconds - 1.3) < 0.01)
    video.play(owner: "pending", generation: 3)
    #expect(video.player.rate == 1)
    notifications.post(name: AVAudioSession.mediaServicesWereLostNotification, object: nil)
    #expect(video.player.rate == 0)
    #expect(events.filter { $0["phase"] as? String == "paused" }.count == 2)
    video.play(owner: "pending", generation: 3)
    #expect(video.player.rate == 0)
  }
  #endif
  @Test(arguments: [1, 2])
  @MainActor func roundedNativeEndpointsStillAdvanceAndEnableConfirmation(count: Int) async throws {
    let url = try await movie()
    defer { try? FileManager.default.removeItem(at: url) }
    let video = LessonVideoPlayer()
    defer { video.dispose(owner: "rounded") }
    var events: [String] = []
    video.onStatus = { events.append($0["phase"] as? String ?? "") }
    let segments: [VideoSegmentTimeline.Segment] = [.init(start: 0.2, end: 0.600008), .init(start: 1.8, end: 2.400008)]
    video.reserve(owner: "rounded", generation: 1)
    try await video.prepare(url: url, segments: Array(segments.prefix(count)), position: 0, rate: 3, owner: "rounded", generation: 1)
    video.play(owner: "rounded", generation: 1)
    let deadline = ContinuousClock.now + .seconds(3)
    while !events.contains("ended") && ContinuousClock.now < deadline { try await Task.sleep(for: .milliseconds(10)) }
    #expect(events.filter { $0 == "ended" }.count == 1)
    #expect(!events.contains("paused"))
    #expect(abs(video.player.currentTime().seconds - (count == 1 ? 0.6 : 2.4)) < 0.0001)
  }
  @Test(arguments: ["pause", "replace", "fail", "inactive", "interruption", "route", "reset"])
  @MainActor func pendingMemberSeekCannotCompleteOrRestartRetiredPlayback(action: String) async throws {
    let url = try await movie()
    defer { try? FileManager.default.removeItem(at: url) }
    var continuation: CheckedContinuation<Bool, Never>?
    let notifications = NotificationCenter()
    let video = LessonVideoPlayer(lifecycleNotifications: notifications, transitionSeek: { _, _ in
      await withCheckedContinuation { continuation = $0 }
    })
    defer { video.dispose(owner: video.owner) }
    var events: [[String: Any]] = []
    video.onStatus = { events.append($0) }
    video.reserve(owner: "group", generation: 1)
    try await video.prepare(url: url, segments: [.init(start: 0.2, end: 0.4), .init(start: 1.8, end: 2.4)],
      position: 0, rate: 3, owner: "group", generation: 1)
    video.play(owner: "group", generation: 1)
    let deadline = ContinuousClock.now + .seconds(5)
    while continuation == nil && ContinuousClock.now < deadline { try await Task.sleep(for: .milliseconds(10)) }
    let pending = try #require(continuation)
    let oldItem = try #require(video.player.currentItem)
    // Duplicate notifications while the seek is pending must not skip another member.
    for _ in 0..<3 { NotificationCenter.default.post(name: .AVPlayerItemDidPlayToEndTime, object: oldItem) }
    #expect(!events.contains { $0["phase"] as? String == "ended" })
    if action == "pause" { video.pause(owner: "group") }
    #if os(iOS)
    if action == "inactive" { notifications.post(name: UIApplication.willResignActiveNotification, object: nil) }
    if action == "interruption" {
      notifications.post(name: AVAudioSession.interruptionNotification, object: nil,
        userInfo: [AVAudioSessionInterruptionTypeKey: AVAudioSession.InterruptionType.began.rawValue])
    }
    if action == "route" {
      notifications.post(name: AVAudioSession.routeChangeNotification, object: nil,
        userInfo: [AVAudioSessionRouteChangeReasonKey: AVAudioSession.RouteChangeReason.oldDeviceUnavailable.rawValue])
    }
    if action == "reset" { notifications.post(name: AVAudioSession.mediaServicesWereResetNotification, object: nil) }
    if ["inactive", "interruption", "route", "reset"].contains(action) {
      let paused = events.filter { $0["phase"] as? String == "paused" }
      #expect(paused.count == 1)
      #expect(paused.last?["generation"] as? Int == 1)
      #expect(abs((paused.last?["position"] as? Double ?? 0) - 0.2) < 0.000001)
      notifications.post(name: UIApplication.didBecomeActiveNotification, object: nil)
      notifications.post(name: AVAudioSession.interruptionNotification, object: nil,
        userInfo: [AVAudioSessionInterruptionTypeKey: AVAudioSession.InterruptionType.ended.rawValue,
          AVAudioSessionInterruptionOptionKey: AVAudioSession.InterruptionOptions.shouldResume.rawValue])
    }
    #else
    if ["inactive", "interruption", "route", "reset"].contains(action) { video.pause(owner: "group") }
    #endif
    if action == "replace" {
      video.reserve(owner: "new", generation: 2)
      try await video.prepare(url: url, segments: [.init(start: 1, end: 1.5)], position: 0, rate: 1, owner: "new", generation: 2)
    }
    pending.resume(returning: action != "fail")
    try await Task.sleep(for: .milliseconds(100))
    NotificationCenter.default.post(name: .AVPlayerItemDidPlayToEndTime, object: oldItem)
    video.play(owner: "group", generation: 1)
    #expect(video.player.rate == 0)
    #expect(!events.contains { $0["phase"] as? String == "ended" })
    #expect(events.filter { $0["phase"] as? String == "failed" }.count == (action == "fail" ? 1 : 0))
    if action == "fail" {
      #expect(abs((events.last?["position"] as? Double ?? 0) - 0.2) < 0.000001)
    }
    if action == "replace" { #expect(abs(video.player.currentTime().seconds - 1) < 0.01) }
  }
  @Test @MainActor func playsSelectedMembersOnceAndResumesOnTheirCombinedTimeline() async throws {
    let url = try await movie()
    defer { try? FileManager.default.removeItem(at: url) }
    let video = LessonVideoPlayer()
    defer { video.dispose(owner: "group") }
    let segments: [VideoSegmentTimeline.Segment] = [.init(start: 0.2, end: 0.6), .init(start: 1.8, end: 2.4)]
    var events: [[String: Any]] = []
    video.onStatus = { events.append($0) }
    video.reserve(owner: "group", generation: 1)
    try await video.prepare(url: url, segments: segments, position: 0, rate: 1.5, owner: "group", generation: 1)
    let item = try #require(video.player.currentItem)
    let output = AVPlayerItemVideoOutput(pixelBufferAttributes: [kCVPixelBufferPixelFormatTypeKey as String: kCVPixelFormatType_32BGRA])
    item.add(output)
    video.play(owner: "group", generation: 1)
    let deadline = ContinuousClock.now + .seconds(5)
    while !events.contains(where: { $0["phase"] as? String == "ended" }) && ContinuousClock.now < deadline {
      let time = video.player.currentTime().seconds
      #expect(time <= 0.61 || time >= 1.79)
      if time > 1.85 && time < 2.3 { #expect(video.player.rate == 1.5) }
      try await Task.sleep(for: .milliseconds(10))
    }
    #expect(events.filter { $0["phase"] as? String == "ended" }.count == 1)
    #expect(!events.contains { $0["phase"] as? String == "paused" })
    #expect(abs((events.last?["duration"] as? Double ?? 0) - 1) < 0.000001)
    #expect(abs(video.player.currentTime().seconds - 2.4) < 0.05)
    #expect(output.copyPixelBuffer(forItemTime: CMTime(seconds: 2.39, preferredTimescale: 60000), itemTimeForDisplay: nil) != nil)
    #expect(video.player.rate == 0)
    video.reserve(owner: "group", generation: 2)
    try await video.prepare(url: url, segments: segments, position: 0.6, rate: 2, owner: "group", generation: 2)
    #expect(abs(video.player.currentTime().seconds - 2) < 0.01)
    video.reserve(owner: "group", generation: 3)
    try await video.prepare(url: url, segments: segments, position: 0, rate: 1, owner: "group", generation: 3)
    #expect(abs(video.player.currentTime().seconds - 0.2) < 0.01)
  }
  func movie(includeAudio: Bool = true) async throws -> URL {
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
    if !includeAudio { return url }
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
    try await video.prepare(url: url, segments: [.init(start: 1, end: 1.5)], position: 0, rate: 2, owner: "test", generation: 1)
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
    try await video.prepare(url: url, segments: [.init(start: 1, end: 1.5)], position: 0.2, rate: 1, owner: "test", generation: 2)
    #expect(abs(video.player.currentTime().seconds - 1.2) < 0.05)
    video.reserve(owner: "test", generation: 3)
    try await video.prepare(url: url, segments: [.init(start: 1, end: 1.5)], position: 0, rate: 1, owner: "test", generation: 3)
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
      try await video.prepare(url: url, segments: [.init(start: 0, end: 1)], position: 0, rate: 1, owner: "test", generation: 1)
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
      try await video.prepare(url: url, segments: [.init(start: 0, end: 1)], position: 0, rate: 1, owner: "invalid", generation: 1)
    }
    video.play(owner: "invalid", generation: 1)
    #expect(video.player.rate == 0)
    video.dispose(owner: "invalid")
  }
  @Test @MainActor func videoWithoutAudioNeverBecomesReadyOrReusesPreviousPlayback() async throws {
    let valid = try await movie(), silent = try await movie(includeAudio: false)
    defer { try? FileManager.default.removeItem(at: valid); try? FileManager.default.removeItem(at: silent) }
    #expect(try await AVURLAsset(url: silent).loadTracks(withMediaType: .video).count == 1)
    #expect(try await AVURLAsset(url: silent).loadTracks(withMediaType: .audio).isEmpty)
    let video = LessonVideoPlayer()
    defer { video.dispose(owner: "test") }
    video.reserve(owner: "test", generation: 1)
    try await video.prepare(url: valid, segments: [.init(start: 0, end: 1)], position: 0, rate: 1, owner: "test", generation: 1)
    var ready = false
    video.onStatus = { event in if event["phase"] as? String == "ready" { ready = true } }
    video.reserve(owner: "test", generation: 2)
    await #expect(throws: (any Error).self) {
      try await video.prepare(url: silent, segments: [.init(start: 0, end: 1)], position: 0, rate: 1, owner: "test", generation: 2)
    }
    #expect(!ready)
    video.play(owner: "test", generation: 2)
    #expect(video.player.rate == 0)
  }
}
