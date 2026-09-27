import AppFoundation
import Foundation
import LearningDomain
import Testing

@MainActor struct AppBootstrapTests {
    @Test func olderFailureCannotReplaceNewerSuccess() async throws {
        let sample = try Self.sample()
        let oldRequest = SuspendedLoader()
        let loader = RestartLoader(first: oldRequest, sample: sample)
        let bootstrap = AppBootstrap { try await loader.load() }
        let oldActivation = Task { await bootstrap.activate() }
        await oldRequest.waitUntilStarted()
        bootstrap.deactivate()
        await bootstrap.activate()
        #expect(bootstrap.state == .ready(sample))
        await oldRequest.finish(.failure(CocoaError(.fileReadUnknown)))
        await oldActivation.value
        #expect(bootstrap.state == .ready(sample))
    }

    @Test func callerCancellationCannotPublishReadyContent() async throws {
        let sample = try Self.sample()
        let loader = SuspendedLoader()
        let bootstrap = AppBootstrap { try await loader.load() }
        let activation = Task { await bootstrap.activate() }
        await loader.waitUntilStarted()
        activation.cancel()
        await loader.finish(.success(sample))
        await activation.value
        #expect(bootstrap.state == .idle)
    }

    @Test func deactivationCancelsUnderlyingWork() async throws {
        let loader = CancellationLoader()
        let bootstrap = AppBootstrap { try await loader.load() }
        let activation = Task { await bootstrap.activate() }
        await loader.waitUntilStarted()
        bootstrap.deactivate()
        // Resume explicitly so a regression fails rather than hanging the test.
        await loader.release()
        await activation.value
        #expect(await loader.wasCancelled)
    }

    @Test(arguments: [false, true])
    func ignoresLateResultAfterDeactivation(fails: Bool) async throws {
        let sample = try Self.sample()
        let loader = SuspendedLoader()
        let bootstrap = AppBootstrap { try await loader.load() }
        let activation = Task { await bootstrap.activate() }
        await loader.waitUntilStarted()
        #expect(bootstrap.state == .loading)
        await bootstrap.activate()
        #expect(await loader.calls == 1)
        bootstrap.deactivate()
        #expect(bootstrap.state == .idle)
        await loader.finish(fails ? .failure(CocoaError(.fileReadUnknown)) : .success(sample))
        await activation.value
        #expect(bootstrap.state == .idle)
    }

    @Test func retriesFailureButDoesNotReloadReadyContent() async throws {
        let sample = try Self.sample()
        let loader = RetryLoader(sample: sample)
        let bootstrap = AppBootstrap { try await loader.load() }
        await bootstrap.activate()
        #expect(bootstrap.state == .failed)
        await bootstrap.activate()
        #expect(bootstrap.state == .ready(sample))
        bootstrap.deactivate()
        await bootstrap.activate()
        #expect(await loader.calls == 2)
    }

    @Test func activatesWithSyntheticContent() async throws {
        let sample = try Self.sample()
        let bootstrap = AppBootstrap { sample }
        #expect(bootstrap.state == .idle)
        await bootstrap.activate()
        #expect(bootstrap.state == .ready(sample))
    }

    private static func sample() throws -> PreviewLibrary {
        try PreviewLibrary.decode(Data(#"{"schemaVersion":1,"lessons":[{"id":"test","title":"Test sample","sentences":[{"id":"hello","source":"Hello.","translation":"안녕하세요."}]}]}"#.utf8))
    }
}

private actor RestartLoader {
    let first: SuspendedLoader
    let sample: PreviewLibrary
    private var calls = 0

    init(first: SuspendedLoader, sample: PreviewLibrary) {
        self.first = first
        self.sample = sample
    }

    func load() async throws -> PreviewLibrary {
        calls += 1
        if calls == 1 { return try await first.load() }
        return sample
    }
}

private actor CancellationLoader {
    private let gate = SuspendedLoader()
    private(set) var wasCancelled = false

    func load() async throws -> PreviewLibrary {
        do { return try await gate.load() }
        catch {
            wasCancelled = Task.isCancelled
            throw error
        }
    }
    func waitUntilStarted() async { await gate.waitUntilStarted() }
    func release() async { await gate.finish(.failure(CancellationError())) }
}

private actor SuspendedLoader {
    private var request: CheckedContinuation<PreviewLibrary, any Error>?
    private var started: CheckedContinuation<Void, Never>?
    private(set) var calls = 0

    func load() async throws -> PreviewLibrary {
        calls += 1
        return try await withCheckedThrowingContinuation { continuation in
            request = continuation
            started?.resume()
            started = nil
        }
    }

    func waitUntilStarted() async {
        if request != nil { return }
        await withCheckedContinuation { started = $0 }
    }

    func finish(_ result: Result<PreviewLibrary, any Error>) {
        request?.resume(with: result)
        request = nil
    }
}

private actor RetryLoader {
    let sample: PreviewLibrary
    private(set) var calls = 0

    init(sample: PreviewLibrary) { self.sample = sample }

    func load() throws -> PreviewLibrary {
        calls += 1
        if calls == 1 { throw CocoaError(.fileReadCorruptFile) }
        return sample
    }
}
