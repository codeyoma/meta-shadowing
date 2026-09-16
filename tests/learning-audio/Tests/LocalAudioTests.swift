import AVFoundation
import Foundation
import Testing

struct LocalAudioTests {
  func tone(_ url: URL, frequency: Double, seconds: Double) throws {
    let rate = 44100.0
    let format = try #require(AVAudioFormat(standardFormatWithSampleRate: rate, channels: 1))
    let count = AVAudioFrameCount(rate * seconds)
    let buffer = try #require(AVAudioPCMBuffer(pcmFormat: format, frameCapacity: count))
    buffer.frameLength = count
    let samples = try #require(buffer.floatChannelData)[0]
    for index in 0..<Int(count) { samples[index] = Float(sin(Double(index) * 2 * .pi * frequency / rate) * 0.3) }
    let file = try AVAudioFile(forWriting: url, settings: [AVFormatIDKey: kAudioFormatMPEG4AAC,
      AVSampleRateKey: rate, AVNumberOfChannelsKey: 1, AVEncoderBitRateKey: 64000])
    try file.write(from: buffer)
  }

  func fixture() throws -> (URL, URL, [URL]) {
    let root = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
    let packages = root.appendingPathComponent("lesson-packages")
    let audio = packages.appendingPathComponent("fixture-v1/audio")
    try FileManager.default.createDirectory(at: audio, withIntermediateDirectories: true)
    let first = audio.appendingPathComponent("first.m4a"), second = audio.appendingPathComponent("second.m4a")
    try tone(first, frequency: 440, seconds: 0.4)
    try tone(second, frequency: 880, seconds: 0.6)
    return (root, packages, [first, second])
  }

  @Test func readsOriginalDurationsWithoutCreatingOrChangingFiles() async throws {
    let (root, packages, files) = try fixture()
    defer { try? FileManager.default.removeItem(at: root) }
    let before = try files.map { try Data(contentsOf: $0) }
    let inspection = LocalAudioInspection(packages: packages)
    let durations = try await inspection.durations(files.map(\.absoluteString))
    #expect(durations.count == 2)
    #expect(abs(durations[0] - 0.4) < 0.03)
    #expect(abs(durations[1] - 0.6) < 0.03)
    let reversed = try await inspection.durations(files.reversed().map(\.absoluteString))
    #expect(reversed == durations.reversed())
    #expect(try files.map { try Data(contentsOf: $0) } == before)
    #expect(try FileManager.default.subpathsOfDirectory(atPath: root.path).sorted() == [
      "lesson-packages", "lesson-packages/fixture-v1", "lesson-packages/fixture-v1/audio",
      "lesson-packages/fixture-v1/audio/first.m4a", "lesson-packages/fixture-v1/audio/second.m4a"])
  }

  @Test func rejectsMissingCorruptRemoteAndEscapingInputs() async throws {
    let (root, packages, files) = try fixture()
    defer { try? FileManager.default.removeItem(at: root) }
    let inspection = LocalAudioInspection(packages: packages)
    let missing = files[0].deletingLastPathComponent().appendingPathComponent("missing.m4a")
    let corrupt = files[0].deletingLastPathComponent().appendingPathComponent("corrupt.m4a")
    try Data("invalid media".utf8).write(to: corrupt)
    let outside = root.appendingPathComponent("outside.m4a")
    try FileManager.default.copyItem(at: files[0], to: outside)
    let link = files[0].deletingLastPathComponent().appendingPathComponent("link.m4a")
    try FileManager.default.createSymbolicLink(at: link, withDestinationURL: outside)
    for uris in [[], Array(repeating: files[0].absoluteString, count: 5), [missing.absoluteString],
      [corrupt.absoluteString], [outside.absoluteString], [link.absoluteString], ["https://example.com/audio.m4a"]] {
      await #expect(throws: (any Error).self) { try await inspection.durations(uris) }
    }
  }

  @Test @MainActor func originalItemsAdvanceInAVQueuePlayerWithoutWritingAudio() async throws {
    let (root, packages, files) = try fixture()
    defer { try? FileManager.default.removeItem(at: root) }
    _ = try await LocalAudioInspection(packages: packages).durations(files.map(\.absoluteString))
    let before = try FileManager.default.subpathsOfDirectory(atPath: root.path).sorted()
    let items = files.map { AVPlayerItem(url: $0) }
    let queue = AVQueuePlayer(items: items)
    queue.isMuted = true
    queue.actionAtItemEnd = .advance
    queue.defaultRate = 3
    queue.playImmediately(atRate: 3)
    defer { queue.pause(); queue.removeAllItems() }
    var observed = Set<Int>()
    let deadline = ContinuousClock.now + .seconds(8)
    while queue.currentItem != nil && ContinuousClock.now < deadline {
      if let index = items.firstIndex(where: { $0 === queue.currentItem }) { observed.insert(index) }
      try await Task.sleep(for: .milliseconds(5))
    }
    #expect(queue.currentItem == nil)
    #expect(observed == [0, 1])
    #expect(try FileManager.default.subpathsOfDirectory(atPath: root.path).sorted() == before)
  }
}
