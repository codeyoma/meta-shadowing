import Foundation
#if os(iOS)
import BackgroundAssets
#endif

public struct HostedPackage: Codable, Sendable {
    public let descriptor: DeliveryPackage
    public let assetPackID: String?
    public init(descriptor: DeliveryPackage, assetPackID: String?) {
        self.descriptor = descriptor; self.assetPackID = assetPackID
    }
}

public struct InstalledPackage: Sendable {
    public let descriptor: DeliveryPackage
    public let root: URL
    public let manifest: PackageManifest
}

/// One owner serializes each immutable package. Callers choose keys, never filesystem paths.
public actor ContentDelivery {
    private struct Entry {
        let package: HostedPackage
        let download: PackageDownload
    }
    private let root: URL
    private let entries: [String: Entry]
    private var listeners: [UUID: (String?, AsyncStream<Void>.Continuation)] = [:]

    public init(root: URL, packages: [HostedPackage],
                transport: @Sendable (HostedPackage) -> (any AssetDelivery)? = ContentDelivery.appleTransport,
                purgeCache: @escaping @Sendable (HostedPackage) async throws -> Void = ContentDelivery.applePurge) throws {
        guard root.isFileURL, packages.count <= 100,
              Set(packages.map { $0.descriptor.key }).count == packages.count else { throw DeliveryError.invalidPackage }
        self.root = root
        var entries: [String: Entry] = [:]
        let installation = PackageInstallation(root: root, ownedKeys: Set(packages.map { $0.descriptor.key }), validateContent: { root, package in
            _ = try PackageManifest.read(root: root, descriptor: package)
        })
        for package in packages {
            try installation.validate(package.descriptor)
            if let asset = package.assetPackID {
                guard asset.range(of: "^[A-Za-z0-9][A-Za-z0-9._-]{0,99}$", options: .regularExpression) != nil else { throw DeliveryError.invalidPackage }
            }
            let download = PackageDownload(installation: installation, transport: transport(package), purgeCache: {
                try await purgeCache(package)
            })
            entries[package.descriptor.key] = Entry(package: package, download: download)
        }
        self.entries = entries
    }

    public nonisolated static func appleTransport(_ package: HostedPackage) -> (any AssetDelivery)? {
        #if os(iOS)
        package.assetPackID.map { AppleAssetDelivery(assetPackID: $0) }
        #else
        nil
        #endif
    }
    public nonisolated static func applePurge(_ package: HostedPackage) async throws {
        #if os(iOS)
        if let id = package.assetPackID { try await AssetPackManager.shared.remove(assetPackWithID: id) }
        #endif
    }

    public func state(packageKey: String) async throws -> DeliveryStatus {
        let entry = try entry(packageKey)
        return try await entry.download.status(entry.package.descriptor)
    }
    public func statuses(packageKey: String) async throws -> AsyncStream<DeliveryStatus> {
        let entry = try entry(packageKey)
        return try await entry.download.statuses(entry.package.descriptor)
    }
    public func cancelAll() async {
        for entry in entries.values { await entry.download.cancel() }
    }
    public func download(packageKey: String) async throws {
        let entry = try entry(packageKey)
        defer { changed(packageKey) }
        try await entry.download.start(entry.package.descriptor)
    }
    public func cancel(packageKey: String) async {
        await entries[packageKey]?.download.cancel()
        changed(packageKey)
    }
    public func remove(packageKey: String) async throws {
        let entry = try entry(packageKey)
        changed(packageKey)
        defer { changed(packageKey) }
        guard try await entry.download.remove(entry.package.descriptor) else { throw DeliveryError.unavailable }
    }
    public func installation(packageKey: String) async throws -> InstalledPackage {
        let entry = try entry(packageKey)
        guard try await entry.download.status(entry.package.descriptor).phase == "ready" else { throw DeliveryError.unavailable }
        try Task.checkCancellation()
        let directory = root.appendingPathComponent(packageKey)
        let manifest = try PackageManifest.read(root: directory, descriptor: entry.package.descriptor)
        return InstalledPackage(descriptor: entry.package.descriptor, root: directory, manifest: manifest)
    }
    public func changes(packageKey: String? = nil) -> AsyncStream<Void> {
        let id = UUID()
        let (stream, continuation) = AsyncStream<Void>.makeStream(bufferingPolicy: .bufferingNewest(1))
        listeners[id] = (packageKey, continuation)
        continuation.onTermination = { [weak self] _ in Task { await self?.removeListener(id) } }
        return stream
    }
    private func entry(_ key: String) throws -> Entry {
        guard let entry = entries[key] else { throw DeliveryError.invalidPackage }
        return entry
    }
    private func changed(_ key: String) {
        for (selected, listener) in listeners.values where selected == nil || selected == key { listener.yield(()) }
    }
    private func removeListener(_ id: UUID) { listeners[id] = nil }
}
