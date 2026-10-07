#if DEBUG
import AppleServices
import AppFoundation
import Foundation

/// Public bundled bytes behind the normal download boundary; no Apple-hosted request.
nonisolated struct ServiceTestAssets: AssetDelivery {
    let root: URL
    let offline: Bool
    let slow: Bool
    init(root: URL, offline: Bool = false, slow: Bool = false) {
        self.root = root; self.offline = offline; self.slow = slow
    }
    static func package(root: URL) throws -> (HostedPackage, CatalogBook) {
        struct Specification: Decodable { let key: String; let metadata: DeliveryPackage.Entry }
        struct Manifest: Decodable { let phrases: [DeliveryPackage.Entry] }
        let raw = try Data(contentsOf: root.appendingPathComponent("manifest.json"))
        let specification = try JSONDecoder().decode(Specification.self, from: Data(contentsOf: root.appendingPathComponent("delivery.json")))
        let files = try JSONDecoder().decode(Manifest.self, from: raw).phrases
        let descriptor = DeliveryPackage(key: specification.key, files: [specification.metadata] + files)
        let parsed = try PackageManifest.decode(raw, descriptor: descriptor)
        return (.init(descriptor: descriptor, assetPackID: nil),
                .init(id: descriptor.key, book: parsed.learningBookID, language: parsed.language,
                      title: "Morning Notes · Download fixture", sentenceCount: parsed.phrases.count))
    }
    func download(progress: @escaping AssetDeliveryProgress) async throws {
        guard !offline else { throw URLError(.notConnectedToInternet) }
        if slow {
            for step in 1...20 {
                try Task.checkCancellation()
                await progress(Double(step) / 20)
                try await Task.sleep(for: .milliseconds(500))
            }
            return
        }
        await progress(0.5)
        try await Task.sleep(for: .milliseconds(300))
        await progress(1)
    }
    func contents(_ file: String) throws -> Data {
        guard !offline else { throw URLError(.notConnectedToInternet) }
        return try Data(contentsOf: root.appendingPathComponent(file), options: .mappedIfSafe)
    }
}
#endif
