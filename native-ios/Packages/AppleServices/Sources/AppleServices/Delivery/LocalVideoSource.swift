import CryptoKit
import Foundation

/// The existing internal, bundled video journey. No arbitrary URL or remote download authority.
public struct LocalVideoSource: AssetDelivery {
    public let package: HostedPackage
    public let manifest: PackageManifest
    private let root: URL

    public init(root: URL) throws {
        guard root.isFileURL else { throw DeliveryError.invalidPackage }
        self.root = root.standardizedFileURL
        let data = try Self.read(root: self.root, path: "manifest.json", limit: 2_000_000)
        struct Header: Decodable {
            struct Media: Decodable { let file: String; let bytes: Int; let sha256: String }
            let id: String; let version: Int; let media: Media
        }
        let header = try JSONDecoder().decode(Header.self, from: data)
        var entries = [Self.entry("manifest.json", data), DeliveryPackage.Entry(file: header.media.file, bytes: header.media.bytes, sha256: header.media.sha256)]
        if FileManager.default.fileExists(atPath: self.root.appendingPathComponent("syntax.json").path) {
            entries.append(Self.entry("syntax.json", try Self.read(root: self.root, path: "syntax.json", limit: 20_000_000)))
        }
        let descriptor = DeliveryPackage(key: "\(header.id)-v\(header.version)", files: entries)
        let manifest = try PackageManifest.decode(data, descriptor: descriptor)
        guard manifest.bookID.hasPrefix("video-"), case .video = manifest.phrases.first?.media else { throw DeliveryError.invalidPackage }
        self.manifest = manifest
        package = HostedPackage(descriptor: descriptor, assetPackID: nil)
    }
    public func download(progress: @escaping AssetDeliveryProgress) async throws {
        try Task.checkCancellation()
        await progress(1)
    }
    public func contents(_ file: String) throws -> Data {
        guard let entry = package.descriptor.files.first(where: { $0.file == file }) else { throw DeliveryError.invalidPackage }
        return try Self.read(root: root, path: file, limit: entry.bytes)
    }
    private static func entry(_ file: String, _ data: Data) -> DeliveryPackage.Entry {
        .init(file: file, bytes: data.count, sha256: SHA256.hash(data: data).map { String(format: "%02x", $0) }.joined())
    }
    private static func read(root: URL, path: String, limit: Int) throws -> Data {
        guard ["manifest.json", "video/source.mp4", "syntax.json"].contains(path), limit > 0 else { throw DeliveryError.invalidPackage }
        // Reject package symlinks, including a replaced source directory and its parents.
        var current = root
        while current.path != "/" && current.path != "/var" {
            guard try current.resourceValues(forKeys: [.isSymbolicLinkKey]).isSymbolicLink != true else { throw DeliveryError.invalidPackage }
            current.deleteLastPathComponent()
        }
        current = root
        for component in path.split(separator: "/") {
            current.appendPathComponent(String(component))
            guard try current.resourceValues(forKeys: [.isSymbolicLinkKey]).isSymbolicLink != true else { throw DeliveryError.invalidPackage }
        }
        let values = try current.resourceValues(forKeys: [.fileSizeKey, .isRegularFileKey])
        guard values.isRegularFile == true, let bytes = values.fileSize, bytes > 0, bytes <= limit else { throw DeliveryError.damagedFiles }
        return try Data(contentsOf: current, options: .mappedIfSafe)
    }
}
