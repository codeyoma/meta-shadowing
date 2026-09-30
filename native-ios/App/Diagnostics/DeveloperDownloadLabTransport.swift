#if DEBUG
import AppleServices
import Foundation

/// Only the external transfer is controlled. ContentDelivery still validates and installs real files.
actor DeveloperDownloadLabTransport: AssetDelivery {
    private let source: ServiceTestAssets
    private let stepDuration: Duration
    private var paused = false
    private var failRequested = false
    private var active = false
    private var waiters: [UUID: AsyncStream<Void>.Continuation] = [:]

    init(root: URL, stepDuration: Duration) {
        source = ServiceTestAssets(root: root)
        self.stepDuration = stepDuration
    }

    func download(progress: @escaping AssetDeliveryProgress) async throws {
        guard !active else { throw DeliveryError.busy }
        active = true; paused = false; failRequested = false
        defer { active = false; paused = false; wakeWaiters() }
        await progress(0)
        for step in 1...40 {
            try await Task.sleep(for: stepDuration)
            try await waitUntilResumed()
            try Task.checkCancellation()
            if failRequested { throw URLError(.networkConnectionLost) }
            await progress(Double(step) / 40)
        }
    }

    func setPaused(_ value: Bool) {
        guard active else { return }
        paused = value
        if !paused { wakeWaiters() }
    }

    func fail() {
        guard active else { return }
        failRequested = true; paused = false; wakeWaiters()
    }

    nonisolated func contents(_ file: String) throws -> Data { try source.contents(file) }

    private func waitUntilResumed() async throws {
        while paused {
            let id = UUID()
            let (stream, continuation) = AsyncStream<Void>.makeStream(bufferingPolicy: .bufferingNewest(1))
            waiters[id] = continuation
            continuation.onTermination = { [weak self] _ in Task { await self?.removeWaiter(id) } }
            for await _ in stream { break }
            waiters.removeValue(forKey: id)?.finish()
            try Task.checkCancellation()
        }
    }

    private func removeWaiter(_ id: UUID) { waiters.removeValue(forKey: id)?.finish() }
    private func wakeWaiters() {
        let previous = waiters; waiters.removeAll()
        for waiter in previous.values { waiter.yield(()); waiter.finish() }
    }
}

nonisolated enum DeveloperDownloadLabFiles {
    @concurrent static func delivery(root: URL, sourceRoot: URL, transport: DeveloperDownloadLabTransport) async throws -> (ContentDelivery, String) {
        let package = try ServiceTestAssets.package(root: sourceRoot).0
        let delivery = try ContentDelivery(root: root.appending(path: "content"), packages: [package],
            transport: { _ in transport }, purgeCache: { _ in })
        return (delivery, package.descriptor.key)
    }

    @concurrent static func saveBackup(_ payload: Data, root: URL) async throws {
        try FileManager.default.createDirectory(at: root, withIntermediateDirectories: true)
        try payload.write(to: root.appending(path: "local-backup.json"), options: .atomic)
    }

    @concurrent static func backup(root: URL) async throws -> Data? {
        let file = root.appending(path: "local-backup.json")
        let values: URLResourceValues
        do { values = try file.resourceValues(forKeys: [.isRegularFileKey, .isSymbolicLinkKey, .fileSizeKey]) }
        catch let error as CocoaError where error.code == .fileReadNoSuchFile { return nil }
        guard values.isRegularFile == true, values.isSymbolicLink != true,
              let size = values.fileSize, size <= 16_777_216 else { throw DeliveryError.damagedFiles }
        return try Data(contentsOf: file, options: .mappedIfSafe)
    }
}
#endif
