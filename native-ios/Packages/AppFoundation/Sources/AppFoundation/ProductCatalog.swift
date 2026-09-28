import Foundation
import LearningDomain

public enum ProductError: Error, Equatable, Sendable {
    case unavailable, invalidContent, denied, busy
}
public struct CatalogBook: Identifiable, Equatable, Sendable {
    public let id: String
    public let book: String
    public let language: String
    public let title: String
    public let sentenceCount: Int
    public init(id: String, book: String, language: String, title: String, sentenceCount: Int) {
        self.id = id; self.book = book; self.language = language
        self.title = title; self.sentenceCount = sentenceCount
    }
}
public enum BookMediaAsset: Equatable, Sendable {
    case audio(file: URL)
    case video(file: URL, start: Double, end: Double)
}
public struct BookMaterials: Sendable {
    public let book: CatalogBook
    public let root: URL
    public let sources: [LearningSource]
    public let media: [BookMediaAsset]
    public init(book: CatalogBook, root: URL, sources: [LearningSource], media: [BookMediaAsset]) {
        self.book = book; self.root = root; self.sources = sources; self.media = media
    }
}
public protocol ProductCatalog: Sendable {
    func books() async throws -> [CatalogBook]
    func materials(packageKey: String) async throws -> BookMaterials
    func permitsPractice(packageKey: String) async -> Bool
}
