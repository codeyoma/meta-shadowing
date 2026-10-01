import AppleServices
import CryptoKit
import Foundation

/// Uses the existing native service keys; absent configuration grants no service authority.
public struct ProductServiceConfiguration: Sendable {
    public let packages: [HostedPackage]
    public let books: [CatalogBook]
    public let localVideo: LocalVideoSource?
    public init(values: [String: String], sampleRoot: URL, localVideoRoot: URL? = nil) throws {
        var packages: [HostedPackage] = [], books: [CatalogBook] = []
        for prefix in ["Sample", "FreeDuo", "PaidDuo"] {
            guard let asset = values[prefix + "AssetPackID"], !asset.isEmpty else { continue }
            if prefix == "FreeDuo" {
                guard values["FreeDuoEnabled"] == "true", values["NativeInternalContent"] == "true" else { throw ProductError.invalidContent }
            }
            guard let group = values["BAAppGroupID"], !group.isEmpty,
                  let raw = values[prefix + "Descriptor"], raw.utf8.count <= 2_000_000 else { throw ProductError.invalidContent }
            let descriptor = try JSONDecoder().decode(DeliveryPackage.self, from: Data(raw.utf8))
            let manifest: Data
            if prefix == "Sample" {
                let file = sampleRoot.appendingPathComponent("manifest.json")
                guard let bytes = try file.resourceValues(forKeys: [.fileSizeKey]).fileSize, bytes <= 20_000_000 else { throw ProductError.invalidContent }
                manifest = try Data(contentsOf: file)
            } else {
                guard let raw = values[prefix + "Manifest"], raw.utf8.count <= 20_000_000 else { throw ProductError.invalidContent }
                manifest = Data(raw.utf8)
            }
            guard let metadata = descriptor.files.first(where: { $0.file == "manifest.json" }),
                  metadata.bytes == manifest.count,
                  metadata.sha256 == SHA256.hash(data: manifest).map({ String(format: "%02x", $0) }).joined()
            else { throw ProductError.invalidContent }
            let parsed = try PackageManifest.decode(manifest, descriptor: descriptor)
            let permitted: [String] = switch prefix {
            case "Sample": ["hosted-morning-notes-v1"]
            case "FreeDuo": ["duo-33-free-test-v1", "duo-33-free-test-v2"]
            default: ["duo-33-v1"]
            }
            guard permitted.contains(descriptor.key), asset != "delivery-diagnostic-v1" else { throw ProductError.invalidContent }
            packages.append(HostedPackage(descriptor: descriptor, assetPackID: asset))
            books.append(CatalogBook(id: descriptor.key, book: parsed.learningBookID, language: parsed.language,
                                     title: parsed.title, sentenceCount: parsed.phrases.count))
        }
        guard Set(packages.compactMap(\.assetPackID)).count == packages.count else { throw ProductError.invalidContent }
        if let localVideoRoot, FileManager.default.fileExists(atPath: localVideoRoot.path) {
            let source = try LocalVideoSource(root: localVideoRoot)
            localVideo = source
            packages.append(source.package)
            books.append(CatalogBook(id: source.package.descriptor.key, book: source.manifest.learningBookID,
                language: source.manifest.language, title: source.manifest.title, sentenceCount: source.manifest.phrases.count))
        } else { localVideo = nil }
        self.packages = packages; self.books = books
    }
}
