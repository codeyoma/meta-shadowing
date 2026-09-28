import AVFoundation
import Foundation
import LearningMedia
import Testing

@MainActor @Suite(.serialized)
struct VideoSegmentTransportTests {
    @Test func groupedVideoSkipsSourceGaps() async throws {
        let root = try MediaFixtureFactory.root()
        defer { try? FileManager.default.removeItem(at: root) }
        let movie = try await MediaFixtureFactory.movie(in: root)
        let video = VideoSegmentTransport()
        let layer = AVPlayerLayer()
        video.attach(layer)
        defer { video.dispose() }
        let sources: [MediaSource] = [.video(file: movie, start: 0, end: 1),
            .video(file: movie, start: 3, end: 5), .video(file: movie, start: 7, end: 7.5)]
        for (position, expected) in [(1.0, 3.0), (3.0, 7.0)] {
            try await video.prepare(PreparedMediaRequest(token: MediaFixtureFactory.token(), sources: sources,
                positionSeconds: position, rate: 3))
            #expect(abs(try #require(layer.player).currentTime().seconds - expected) < 0.01)
        }
        var ends: [MediaPosition] = []
        video.onEvent = { if case let .ended(position) = $0.kind { ends.append(position) } }
        let request = PreparedMediaRequest(token: MediaFixtureFactory.token(), sources: sources, positionSeconds: 0, rate: 3)
        try await video.prepare(request)
        let output = AVPlayerItemVideoOutput(pixelBufferAttributes: [kCVPixelBufferPixelFormatTypeKey as String: kCVPixelFormatType_32BGRA])
        try #require(layer.player?.currentItem).add(output)
        try video.play(token: request.token)
        try await waitForMedia { !ends.isEmpty }
        #expect(ends.count == 1)
        #expect(ends.first == MediaPosition(seconds: 3.5, duration: 3.5))
        #expect(layer.player?.rate == 0)
        #expect(abs(try #require(layer.player).currentTime().seconds - 7.5) < 0.04)
        #expect(layer.player?.currentItem != nil)
        #expect(output.copyPixelBuffer(forItemTime: CMTime(seconds: 7.49, preferredTimescale: 60_000), itemTimeForDisplay: nil) != nil)
        let final = PreparedMediaRequest(token: MediaFixtureFactory.token(), sources: sources, positionSeconds: 3.5, rate: 1)
        try await video.prepare(final); try video.play(token: final.token)
        #expect(ends.count == 2 && layer.player?.rate == 0)
        let replay = PreparedMediaRequest(token: MediaFixtureFactory.token(), sources: sources, positionSeconds: 0.2, rate: 0.5)
        try await video.prepare(replay)
        #expect(layer.player?.rate == 0)
        try video.play(token: replay.token)
        #expect(layer.player?.rate == 0.5)
        #expect((video.pause()?.seconds ?? 0) >= 0.19)
    }

    @Test func pauseDuringMemberSeekCannotRestart() async throws {
        let root = try MediaFixtureFactory.root()
        defer { try? FileManager.default.removeItem(at: root) }
        let movie = try await MediaFixtureFactory.movie(in: root)
        var pending: CheckedContinuation<Bool, Never>?
        let video = VideoSegmentTransport(transitionSeek: { _, _ in
            await withCheckedContinuation { pending = $0 }
        })
        let layer = AVPlayerLayer()
        video.attach(layer)
        defer { video.dispose() }
        var ends = 0
        video.onEvent = { if case .ended = $0.kind { ends += 1 } }
        let request = PreparedMediaRequest(token: MediaFixtureFactory.token(), sources: [
            .video(file: movie, start: 0.2, end: 0.4), .video(file: movie, start: 3, end: 3.5)], positionSeconds: 0, rate: 3)
        try await video.prepare(request)
        try video.play(token: request.token)
        try await waitForMedia { pending != nil }
        let position = try #require(video.pause())
        #expect(abs(position.seconds - 0.2) < 0.0001)
        pending?.resume(returning: true)
        try await Task.sleep(for: .milliseconds(100))
        #expect(layer.player?.rate == 0)
        #expect(ends == 0)
        #expect(throws: MediaFailure.cancelled) { try video.play(token: request.token) }
    }

    @Test func duplicateBoundaryCallbacksEndOnlyOnce() async throws {
        let root = try MediaFixtureFactory.root()
        defer { try? FileManager.default.removeItem(at: root) }
        let file = try await MediaFixtureFactory.movie(in: root)
        let video = VideoSegmentTransport()
        let layer = AVPlayerLayer(); video.attach(layer)
        defer { video.dispose() }
        var ends = 0
        video.onEvent = { if case .ended = $0.kind { ends += 1 } }
        let request = PreparedMediaRequest(token: MediaFixtureFactory.token(), sources: [.video(file: file, start: 1, end: 1.2)], positionSeconds: 0, rate: 3)
        try await video.prepare(request)
        let item = try #require(layer.player?.currentItem)
        // An early notification is not a completed selected segment.
        NotificationCenter.default.post(name: .AVPlayerItemDidPlayToEndTime, object: item)
        #expect(ends == 0)
        try video.play(token: request.token)
        try await waitForMedia { ends == 1 }
        for _ in 0..<3 { NotificationCenter.default.post(name: .AVPlayerItemDidPlayToEndTime, object: item) }
        #expect(ends == 1)
        video.dispose()
        #expect(layer.player == nil)
    }

    @Test func missingPeriodicCallbackStillHonorsNativeEndBound() async throws {
        let root = try MediaFixtureFactory.root()
        defer { try? FileManager.default.removeItem(at: root) }
        let file = try await MediaFixtureFactory.movie(in: root)
        let video = VideoSegmentTransport()
        let layer = AVPlayerLayer(); video.attach(layer)
        defer { video.dispose() }
        var ended = false
        video.onEvent = { if case .ended = $0.kind { ended = true } }
        // Ends before the 200 ms sampling interval. Native bounds, not UI ticks, stop it.
        let request = PreparedMediaRequest(token: MediaFixtureFactory.token(), sources: [.video(file: file, start: 1, end: 1.1)], positionSeconds: 0, rate: 3)
        try await video.prepare(request); try video.play(token: request.token)
        try await waitForMedia { ended }
        #expect(abs(try #require(layer.player).currentTime().seconds - 1.1) < 0.04)
        #expect(layer.player?.rate == 0)
    }

    @Test func unavailableVideoCannotReusePreviousPlayback() async throws {
        let root = try MediaFixtureFactory.root()
        defer { try? FileManager.default.removeItem(at: root) }
        let file = try await MediaFixtureFactory.movie(in: root, includeAudio: false)
        let video = VideoSegmentTransport()
        defer { video.dispose() }
        let request = PreparedMediaRequest(token: MediaFixtureFactory.token(), sources: [.video(file: file, start: 0, end: 1)], positionSeconds: 0, rate: 1)
        await #expect(throws: MediaFailure.invalidAsset) { try await video.prepare(request) }
        #expect(throws: MediaFailure.cancelled) { try video.play(token: request.token) }
        let audioOnly = try MediaFixtureFactory.tone(in: root)
        await #expect(throws: MediaFailure.invalidAsset) {
            try await video.prepare(.init(token: MediaFixtureFactory.token(), sources: [.video(file: audioOnly, start: 0, end: 0.2)], positionSeconds: 0, rate: 1))
        }
        let corrupt = root.appending(path: "corrupt.mp4")
        try Data([1, 2, 3]).write(to: corrupt)
        await #expect(throws: MediaFailure.unavailable) {
            try await video.prepare(PreparedMediaRequest(token: MediaFixtureFactory.token(), sources: [.video(file: corrupt, start: 0, end: 1)], positionSeconds: 0, rate: 1))
        }
    }
}
