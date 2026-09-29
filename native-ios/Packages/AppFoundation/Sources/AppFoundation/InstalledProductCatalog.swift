import AppleServices
import Foundation
import LearningDomain
import LearningReference

/// Library metadata can be visible before download; installed bytes never confer ownership.
public actor InstalledProductCatalog: ProductCatalog {
    private let bundled: any ProductCatalog
    private let delivery: ContentDelivery
    private let listings: [CatalogBook]
    public init(bundled: any ProductCatalog, delivery: ContentDelivery, listings: [CatalogBook]) {
        self.bundled = bundled; self.delivery = delivery; self.listings = listings
    }
    public func books() async throws -> [CatalogBook] {
        let bundled = try await bundled.books()
        guard Set((bundled + listings).map(\.id)).count == bundled.count + listings.count else { throw ProductError.invalidContent }
        return bundled + listings
    }
    public func permitsPractice(packageKey: String) async -> Bool {
        if listings.contains(where: { $0.id == packageKey }) {
            return (try? await delivery.installation(packageKey: packageKey)) != nil
        }
        return await bundled.permitsPractice(packageKey: packageKey)
    }
    public func materials(packageKey: String) async throws -> BookMaterials {
        guard let listing = listings.first(where: { $0.id == packageKey }) else {
            return try await bundled.materials(packageKey: packageKey)
        }
        let installed = try await delivery.installation(packageKey: packageKey)
        let manifest = installed.manifest
        guard manifest.learningBookID == listing.book, manifest.language == listing.language,
              manifest.phrases.count == listing.sentenceCount else { throw ProductError.invalidContent }
        return BookMaterials(book: listing, root: installed.root,
            sources: manifest.phrases.enumerated().map {
                LearningSource(index: $0.offset, text: $0.element.text, translation: $0.element.translation)
            }, media: manifest.phrases.map { phrase in
                switch phrase.media {
                case .audio(let path): .audio(file: installed.root.appendingPathComponent(path))
                case .video(let path, let start, let end): .video(file: installed.root.appendingPathComponent(path), start: start, end: end)
                }
            })
    }
    public func syntax(packageKey: String) async throws -> InstalledSyntaxFile? {
        guard listings.contains(where: { $0.id == packageKey }) else { return try await bundled.syntax(packageKey: packageKey) }
        let installed = try await delivery.installation(packageKey: packageKey)
        guard let file = installed.descriptor.files.first(where: { $0.file == "syntax.json" }) else { return nil }
        return InstalledSyntaxFile(root: installed.root, relativePath: file.file, byteCount: file.bytes, sha256: file.sha256)
    }
    public func referenceChanges() async -> AsyncStream<Void> { await delivery.changes() }
    public func referenceChanges(packageKey: String) async -> AsyncStream<Void> {
        if listings.contains(where: { $0.id == packageKey }) { return await delivery.changes(packageKey: packageKey) }
        return await bundled.referenceChanges(packageKey: packageKey)
    }
}
