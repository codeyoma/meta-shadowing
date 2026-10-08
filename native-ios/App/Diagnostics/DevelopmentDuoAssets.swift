#if DEBUG
import AppleServices
import AppFoundation
import CryptoKit
import Foundation

/// Reads an explicitly staged private package for local development.
/// ContentDelivery still owns validation, explicit installation and removal.
nonisolated struct DevelopmentDuoAssets: AssetDelivery {
    let package: HostedPackage
    let book: CatalogBook
    private let root: URL

    init(root: URL) throws {
        let descriptorData = try Self.read(root: root, path: "descriptor.json", limit: 2_000_000)
        let descriptor = try JSONDecoder().decode(DeliveryPackage.self, from: descriptorData)
        guard descriptor.key == "duo-33-free-test-v2",
              let metadata = descriptor.files.first(where: { $0.file == "manifest.json" }) else {
            throw DeliveryError.invalidPackage
        }
        let data = try Self.read(root: root, path: "manifest.json", limit: 20_000_000)
        guard data.count == metadata.bytes,
              SHA256.hash(data: data).map({ String(format: "%02x", $0) }).joined() == metadata.sha256 else {
            throw DeliveryError.damagedFiles
        }
        let manifest = try PackageManifest.decode(data, descriptor: descriptor)
        self.root = root
        package = HostedPackage(descriptor: descriptor, assetPackID: nil)
        book = CatalogBook(id: descriptor.key, book: manifest.learningBookID, language: manifest.language,
                           title: "DUO 3.3", sentenceCount: manifest.phrases.count)
    }

    func download(progress: @escaping AssetDeliveryProgress) async throws {
        try Task.checkCancellation()
        await progress(1)
    }

    func contents(_ file: String) throws -> Data {
        guard let entry = package.descriptor.files.first(where: { $0.file == file }) else {
            throw DeliveryError.invalidPackage
        }
        return try Self.read(root: root, path: file, limit: min(entry.bytes, 50_000_000))
    }

    private static func read(root: URL, path: String, limit: Int) throws -> Data {
        guard root.isFileURL, limit > 0, !path.isEmpty, !path.hasPrefix("/"),
              !path.contains("\\"), !path.split(separator: "/").contains("..") else {
            throw DeliveryError.invalidPackage
        }
        let base = root.standardizedFileURL
        let file = base.appendingPathComponent(path).standardizedFileURL
        guard file.path.hasPrefix(base.path + "/"),
              file.resolvingSymlinksInPath() == file else { throw DeliveryError.invalidPackage }
        let values = try file.resourceValues(forKeys: [.fileSizeKey, .isRegularFileKey])
        guard values.isRegularFile == true, let bytes = values.fileSize, bytes > 0, bytes <= limit else {
            throw DeliveryError.damagedFiles
        }
        return try Data(contentsOf: file, options: .mappedIfSafe)
    }
}
#endif
