#if DEBUG
import AppFoundation
import Foundation

/// An opt-in layout/practice sample with its own durable learning identity.
actor DevelopmentLibraryCatalog: ProductCatalog {
    nonisolated static let sampleKey = "long-title-practice-v1"
    private let bundled: any ProductCatalog

    init(bundled: any ProductCatalog) { self.bundled = bundled }

    func books() async throws -> [CatalogBook] {
        let books = try await bundled.books()
        guard let original = books.first(where: { $0.id == "morning-notes-v1" }) else {
            throw ProductError.invalidContent
        }
        return books + [sampleBook(original)]
    }

    func permitsPractice(packageKey: String) async -> Bool {
        await bundled.permitsPractice(packageKey: sourceKey(packageKey))
    }

    func materials(packageKey: String) async throws -> BookMaterials {
        let original = try await bundled.materials(packageKey: sourceKey(packageKey))
        guard packageKey == Self.sampleKey else { return original }
        return BookMaterials(book: sampleBook(original.book), root: original.root,
                             sources: original.sources, media: original.media)
    }

    private func sourceKey(_ key: String) -> String {
        key == Self.sampleKey ? "morning-notes-v1" : key
    }

    private func sampleBook(_ original: CatalogBook) -> CatalogBook {
        CatalogBook(id: Self.sampleKey, book: "long-title-practice", language: original.language,
                    title: "Morning Notes · Everyday English Shadowing Practice",
                    sentenceCount: original.sentenceCount)
    }
}
#endif
