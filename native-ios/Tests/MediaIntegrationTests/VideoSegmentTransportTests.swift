import AVFoundation
import Foundation
import LearningDomain
import LearningMedia
import Testing

@MainActor @Suite(.serialized)
struct VideoSegmentTransportTests {
    @Test func shortConnectedMemberUpdatesCaptionBeforePeriodicSample() async throws {
        let root = try MediaFixtureFactory.root()
        defer { try? FileManager.default.removeItem(at: root) }
        let file = try await MediaFixtureFactory.movie(in: root)
        let video = VideoSegmentTransport()
        let layer = AVPlayerLayer(); video.attach(layer)
        defer { video.dispose() }
        let request = PreparedMediaRequest(token: MediaFixtureFactory.token(), sources: [
            .video(file: file, start: 1, end: 1.1), .video(file: file, start: 1.08, end: 2)], positionSeconds: 0, rate: 1)
        try await video.prepare(request)
        try video.play(token: request.token)
        try await waitForMedia { video.presentation.frame?.member == 1 }
        #expect(try #require(layer.player).currentTime().seconds < 1.18,
                "Caption boundaries must not wait for the 200 ms progress sampler")
    }

    @Test func overlappingAndTouchingMembersPlayOnceWithoutSeeking() async throws {
        let root = try MediaFixtureFactory.root()
        defer { try? FileManager.default.removeItem(at: root) }
        let file = try await MediaFixtureFactory.movie(in: root)
        var seeks = 0
        let video = VideoSegmentTransport(transitionSeek: { player, time in
            seeks += 1
            return await player.seek(to: time, toleranceBefore: .zero, toleranceAfter: .zero)
        })
        let layer = AVPlayerLayer(); video.attach(layer)
        defer { video.dispose() }
        let sources: [MediaSource] = [.video(file: file, start: 1, end: 2),
            .video(file: file, start: 1.8, end: 3), .video(file: file, start: 3, end: 4)]
        var ends: [MediaPosition] = []
        video.onEvent = { if case let .ended(position) = $0.kind { ends.append(position) } }
        let request = PreparedMediaRequest(token: MediaFixtureFactory.token(), sources: sources, positionSeconds: 0, rate: 3)
        try await video.prepare(request)
        let player = try #require(layer.player)
        #expect(abs(try #require(player.currentItem).forwardPlaybackEndTime.seconds - 4) < 0.001)
        try video.play(token: request.token)
        try await waitForMedia { video.presentation.frame?.member == 1 }
        #expect(player.rate == 3, "A caption boundary must not pause continuous playback")
        try await waitForMedia { !ends.isEmpty }
        #expect(seeks == 0, "Overlapping and touching members must not seek or replay shared time")
        #expect(ends == [.init(seconds: 3, duration: 3)])
        #expect(video.presentation.frame?.member == 2)
        #expect(abs(player.currentTime().seconds - 4) < 0.04)
        // A checkpoint inside the former overlap maps to the original source clock.
        try await video.prepare(.init(token: MediaFixtureFactory.token(), sources: sources, positionSeconds: 0.9, rate: 1))
        #expect(abs(try #require(layer.player).currentTime().seconds - 1.9) < 0.01)
        #expect(video.presentation.frame?.member == 1)
        #expect(abs(try #require(video.pause()).duration - 3) < 0.001)
        // Studied alone, the second phrase still starts at its original 1.8, not 2.
        try await video.prepare(.init(token: MediaFixtureFactory.token(), sources: [sources[1]], positionSeconds: 0, rate: 1))
        #expect(abs(try #require(layer.player).currentTime().seconds - 1.8) < 0.01)
        #expect(abs(try #require(video.pause()).duration - 1.2) < 0.001)
    }

    @Test func unpreparedUnitAndCycleNeverSelectOutgoingFrameCaptions() async throws {
        let root = try MediaFixtureFactory.root()
        defer { try? FileManager.default.removeItem(at: root) }
        let file = try await MediaFixtureFactory.movie(in: root)
        let video = VideoSegmentTransport()
        defer { video.dispose() }
        let token = MediaFixtureFactory.token()
        #expect(video.presentation.member(planID: token.planID, unit: 0, cycle: 1) == nil)
        try await video.prepare(.init(token: token, sources: [.video(file: file, start: 0, end: 1)],
                                      positionSeconds: 1, rate: 1))
        #expect(video.presentation.member(planID: token.planID, unit: 0, cycle: 1) == 0)
        // The session can advance before preparation starts. The retained frame is
        // not permission to show the new unit's or confirmed cycle's first caption.
        #expect(video.presentation.member(planID: token.planID, unit: 1, cycle: 1) == nil)
        #expect(video.presentation.member(planID: token.planID, unit: 0, cycle: 2) == nil)
        #expect(video.presentation.member(planID: "replacement", unit: 0, cycle: 1) == nil)
        let next = TransportToken(writerID: token.writerID, planID: token.planID, unit: 1,
                                  cycle: 1, generation: UUID())
        let request = PreparedMediaRequest(token: next, sources: [.video(file: file, start: 3, end: 4)],
                                           positionSeconds: 0, rate: 1)
        let cancelled = Task { @MainActor in try await video.prepare(request) }
        cancelled.cancel()
        await #expect(throws: MediaFailure.cancelled) { try await cancelled.value }
        #expect(video.presentation.frame?.token == token)
        #expect(video.presentation.member(planID: next.planID, unit: next.unit, cycle: next.cycle) == nil)
        try await video.prepare(request)
        #expect(video.presentation.member(planID: next.planID, unit: next.unit, cycle: next.cycle) == 0)
        video.dispose()
        #expect(video.presentation.member(planID: next.planID, unit: next.unit, cycle: next.cycle) == nil)
    }

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
            #expect(video.presentation.frame?.member == (position == 1 ? 1 : 2))
        }
        var ends: [MediaPosition] = []
        video.onEvent = { if case let .ended(position) = $0.kind { ends.append(position) } }
        let request = PreparedMediaRequest(token: MediaFixtureFactory.token(), sources: sources, positionSeconds: 0, rate: 3)
        try await video.prepare(request)
        #expect(video.presentation.frame?.member == 0)
        #expect(video.presentation.frame?.token == request.token)
        let output = AVPlayerItemVideoOutput(pixelBufferAttributes: [kCVPixelBufferPixelFormatTypeKey as String: kCVPixelFormatType_32BGRA])
        try #require(layer.player?.currentItem).add(output)
        try video.play(token: request.token)
        try await waitForMedia { !ends.isEmpty }
        #expect(video.presentation.frame?.member == 2)
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
        #expect(video.presentation.frame?.member == 0)
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
        #expect(video.presentation.frame?.member == 0, "Pending native seek still holds the outgoing frame")
        let position = try #require(video.pause())
        #expect(abs(position.seconds - 0.2) < 0.0001)
        pending?.resume(returning: true)
        try await Task.sleep(for: .milliseconds(100))
        #expect(layer.player?.rate == 0)
        #expect(ends == 0)
        #expect(video.presentation.frame?.member == 0, "Cancelled seek cannot publish the next caption")
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
        #expect(video.presentation.frame == nil)
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
