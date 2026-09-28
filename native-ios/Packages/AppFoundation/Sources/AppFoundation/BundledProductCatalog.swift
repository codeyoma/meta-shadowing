import Foundation
import LearningDomain
import CryptoKit

/// Reads the app's bundled public sample. No hosted package or ownership authority.
/// The root must remain immutable for this catalog's lifetime, as an installed app bundle does.
public actor BundledProductCatalog: ProductCatalog {
    private let root: URL
    private var validatedMaterials: BookMaterials?
    public init(root: URL) { self.root = root }

    public func books() throws -> [CatalogBook] { [try manifest().book] }
    public func permitsPractice(packageKey: String) -> Bool {
        (try? manifest().book.id) == packageKey
    }
    public func materials(packageKey: String) throws -> BookMaterials {
        try Task.checkCancellation()
        if let validatedMaterials {
            guard validatedMaterials.book.id == packageKey else { throw ProductError.denied }
            return validatedMaterials
        }
        let manifest = try manifest()
        guard manifest.book.id == packageKey else { throw ProductError.denied }
        let base = root.standardizedFileURL.resolvingSymlinksInPath()
        var media: [BookMediaAsset] = []
        for phrase in manifest.phrases {
            try Task.checkCancellation()
            guard !phrase.file.hasPrefix("/"), !phrase.file.contains("\\"),
                  !phrase.file.split(separator: "/").contains(".."),
                  phrase.bytes > 0, phrase.bytes <= 64 * 1024 * 1024 else { throw ProductError.invalidContent }
            let file = base.appending(path: phrase.file).standardizedFileURL.resolvingSymlinksInPath()
            guard file.path.hasPrefix(base.path + "/") else { throw ProductError.invalidContent }
            let attributes = try file.resourceValues(forKeys: [.fileSizeKey, .isRegularFileKey])
            guard attributes.isRegularFile == true, attributes.fileSize == phrase.bytes else { throw ProductError.invalidContent }
            let data = try Data(contentsOf: file)
            let digest = SHA256.hash(data: data).map { String(format: "%02x", $0) }.joined()
            guard data.count == phrase.bytes, digest == phrase.sha256 else { throw ProductError.invalidContent }
            media.append(.audio(file: file))
        }
        let materials = BookMaterials(book: manifest.book, root: base,
            sources: manifest.phrases.enumerated().map {
                LearningSource(index: $0.offset, text: $0.element.text, translation: $0.element.translation)
            }, media: media)
        try Task.checkCancellation()
        validatedMaterials = materials
        return materials
    }
    private func manifest() throws -> Manifest {
        try Task.checkCancellation()
        guard root.isFileURL else { throw ProductError.invalidContent }
        let file = root.appending(path: "manifest.json")
        let base = root.standardizedFileURL.resolvingSymlinksInPath()
        guard file.resolvingSymlinksInPath().path.hasPrefix(base.path + "/"),
              let size = try file.resourceValues(forKeys: [.fileSizeKey]).fileSize,
              (1...4_194_304).contains(size) else { throw ProductError.invalidContent }
        let manifest = try JSONDecoder().decode(Manifest.self, from: Data(contentsOf: file))
        _ = try LearningScope(profileID: "bundled", packageKey: manifest.book.id,
                              language: manifest.book.language, book: manifest.id, stage: 1)
        guard !manifest.title.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty,
              (1...100_000).contains(manifest.phrases.count),
              manifest.phrases.allSatisfy({ !$0.text.isEmpty && !$0.translation.isEmpty }) else { throw ProductError.invalidContent }
        return manifest
    }
    private struct Manifest: Decodable {
        struct Phrase: Decodable {
            let text: String, translation: String, file: String, sha256: String
            let bytes: Int
        }
        let id: String, title: String, language: String
        let version: Int
        let phrases: [Phrase]
        var book: CatalogBook {
            CatalogBook(id: "\(id)-v\(version)", book: id, language: language.lowercased(),
                        title: title, sentenceCount: phrases.count)
        }
    }
}
