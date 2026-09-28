import Foundation
import LearningMedia
import Testing

@MainActor @Suite(.serialized)
struct AudioQueueTransportTests {
    @Test func queuePlaysSelectedSourcesOnce() async throws {
        let root = try MediaFixtureFactory.root()
        defer { try? FileManager.default.removeItem(at: root) }
        let first = try MediaFixtureFactory.tone(in: root, name: "first", duration: 0.2)
        let second = try MediaFixtureFactory.tone(in: root, name: "second", duration: 0.3)
        let transport = AudioQueueTransport()
        defer { transport.dispose() }
        var ends: [MediaPosition] = []
        transport.onEvent = { if case let .ended(position) = $0.kind { ends.append(position) } }
        let request = PreparedMediaRequest(token: MediaFixtureFactory.token(),
            sources: [.audio(file: first), .audio(file: second)], positionSeconds: 0, rate: 1)
        try await transport.prepare(request)
        try transport.play(token: request.token)
        try await waitForMedia { !ends.isEmpty }
        #expect(ends.count == 1)
        #expect(abs(try #require(ends.first).seconds - 0.5) < 0.01)
        #expect(abs(try #require(ends.first).duration - 0.5) < 0.01)
        _ = transport.pause()
        try await Task.sleep(for: .milliseconds(100))
        #expect(ends.count == 1)
    }

    @Test func pauseSeekReentryKeepsSelectedPosition() async throws {
        let root = try MediaFixtureFactory.root()
        defer { try? FileManager.default.removeItem(at: root) }
        let first = try MediaFixtureFactory.tone(in: root, name: "first", duration: 0.5)
        let second = try MediaFixtureFactory.tone(in: root, name: "second", duration: 0.5)
        let transport = AudioQueueTransport()
        defer { transport.dispose() }
        let request = PreparedMediaRequest(token: MediaFixtureFactory.token(),
            sources: [.audio(file: first), .audio(file: second)], positionSeconds: 0.5, rate: 0.5)
        try await transport.prepare(request)
        let position = try #require(transport.pause())
        #expect(abs(position.seconds - 0.5) < 0.01)
        #expect(throws: MediaFailure.cancelled) { try transport.play(token: request.token) }
        let replacement = PreparedMediaRequest(token: MediaFixtureFactory.token(), sources: request.sources,
            positionSeconds: position.seconds, rate: 3)
        try await transport.prepare(replacement)
        var ended = false
        transport.onEvent = { if case .ended = $0.kind { ended = true } }
        try transport.play(token: replacement.token)
        try await waitForMedia { ended }
        #expect(abs(try #require(transport.pause()).seconds - 1) < 0.01)
    }

    @Test func replacementDuringPreparationCannotStart() async throws {
        let root = try MediaFixtureFactory.root()
        defer { try? FileManager.default.removeItem(at: root) }
        let file = try MediaFixtureFactory.tone(in: root)
        let transport = AudioQueueTransport()
        defer { transport.dispose() }
        let first = PreparedMediaRequest(token: MediaFixtureFactory.token(), sources: [.audio(file: file)], positionSeconds: 0, rate: 1)
        let operation = Task { @MainActor in try await transport.prepare(first) }
        await Task.yield()
        transport.pause()
        operation.cancel()
        _ = try? await operation.value
        #expect(throws: MediaFailure.cancelled) { try transport.play(token: first.token) }
        let next = PreparedMediaRequest(token: MediaFixtureFactory.token(), sources: [.audio(file: file)], positionSeconds: 0, rate: 1)
        try await transport.prepare(next)
        #expect(throws: MediaFailure.cancelled) { try transport.play(token: first.token) }
        try transport.play(token: next.token)
        transport.dispose()
        transport.dispose()
        #expect(throws: MediaFailure.cancelled) { try transport.play(token: next.token) }
    }

    @Test(arguments: ["missing", "empty", "corrupt"])
    func failureDoesNotReportEnd(_ kind: String) async throws {
        let root = try MediaFixtureFactory.root()
        defer { try? FileManager.default.removeItem(at: root) }
        let transport = AudioQueueTransport()
        defer { transport.dispose() }
        var ended = false
        transport.onEvent = { if case .ended = $0.kind { ended = true } }
        let file = root.appending(path: "broken.wav")
        if kind != "missing" { try Data(kind == "empty" ? [] : [0, 1, 2]).write(to: file) }
        await #expect(throws: MediaFailure.unavailable) {
            try await transport.prepare(PreparedMediaRequest(token: MediaFixtureFactory.token(),
                sources: [.audio(file: file)], positionSeconds: 0, rate: 1))
        }
        #expect(!ended)
        transport.dispose()
    }
}
