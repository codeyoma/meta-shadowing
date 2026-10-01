import Foundation
import AppleServices
import CryptoKit
import Testing
@testable import AppFoundation

struct ServiceConfigurationTests {
    @Test func legacyDuoDeliveryConfigurationNeedsNoPurchaseProduct() throws {
        let fixture = try legacyDuoConfiguration()
        let config = try ProductServiceConfiguration(values: fixture.values, sampleRoot: URL(fileURLWithPath: "/unused"))
        #expect(config.packages.map(\.descriptor.key) == ["duo-33-v1"])
        #expect(config.books.map(\.book) == ["duo-33"])
        #expect(config.books.first?.sentenceCount == 560)
        var historical = fixture.values
        historical["LearningBookProductID"] = "com.example.historical"
        let old = try ProductServiceConfiguration(values: historical, sampleRoot: URL(fileURLWithPath: "/unused"))
        #expect(old.packages.map(\.descriptor) == config.packages.map(\.descriptor))
        #expect(old.books == config.books)
    }
    @Test func unconfiguredBuildDoesNotInventProductsOrDownloads() throws {
        let config = try ProductServiceConfiguration(values: [:], sampleRoot: URL(fileURLWithPath: "/unused"))
        #expect(config.packages.isEmpty)
        #expect(config.books.isEmpty)
    }
    @Test func partialDeliveryConfigurationIsRejected() {
        #expect(throws: (any Error).self) {
            try ProductServiceConfiguration(values: ["SampleAssetPackID": "fictional-sample"], sampleRoot: URL(fileURLWithPath: "/unused"))
        }
    }
    @Test(arguments: ["FreeDuoEnabled", "NativeInternalContent"])
    func internalCatalogStillRequiresBothExplicitFlags(missing: String) throws {
        var values = try legacyDuoConfiguration(book: "duo-33-free-test", prefix: "FreeDuo").values
        values["FreeDuoEnabled"] = "true"; values["NativeInternalContent"] = "true"
        #expect(try ProductServiceConfiguration(values: values, sampleRoot: URL(fileURLWithPath: "/unused")).books.count == 1)
        values[missing] = nil
        #expect(throws: ProductError.invalidContent) {
            try ProductServiceConfiguration(values: values, sampleRoot: URL(fileURLWithPath: "/unused"))
        }
    }
    @Test func manifestMismatchAndUnknownPackageRemainRejected() throws {
        var fixture = try legacyDuoConfiguration().values
        fixture["PaidDuoManifest"]! += " "
        #expect(throws: ProductError.invalidContent) {
            try ProductServiceConfiguration(values: fixture, sampleRoot: URL(fileURLWithPath: "/unused"))
        }
        let unknown = try legacyDuoConfiguration(book: "unknown").values
        #expect(throws: ProductError.invalidContent) {
            try ProductServiceConfiguration(values: unknown, sampleRoot: URL(fileURLWithPath: "/unused"))
        }
    }
    @Test func duplicateAssetIDsRemainRejected() throws {
        var fixture = try legacyDuoConfiguration().values
        let free = try legacyDuoConfiguration(book: "duo-33-free-test", prefix: "FreeDuo").values
        for (key, value) in free { fixture[key] = value }
        fixture["FreeDuoEnabled"] = "true"; fixture["NativeInternalContent"] = "true"
        #expect(throws: ProductError.invalidContent) {
            try ProductServiceConfiguration(values: fixture, sampleRoot: URL(fileURLWithPath: "/unused"))
        }
    }
}

private func legacyDuoConfiguration(book: String = "duo-33", prefix: String = "PaidDuo") throws -> (values: [String: String], descriptor: DeliveryPackage) {
    let hash = "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad"
    let metadata = ["cover.jpg", "info.json", "text.txt", "syntax.json"].map {
        DeliveryPackage.Entry(file: $0, bytes: 3, sha256: hash)
    }
    let audio = (1...560).map { DeliveryPackage.Entry(file: String(format: "audio/phrase-%03d.m4a", $0), bytes: 3, sha256: hash) }
    let phrases: [[String: Any]] = audio.map {
        ["text": "Hello", "translation": "안녕", "file": $0.file, "bytes": 3, "sha256": hash, "section": 1]
    }
    let metadataJSON = try JSONSerialization.jsonObject(with: JSONEncoder().encode(metadata))
    let manifest = try JSONSerialization.data(withJSONObject: ["id": book, "version": 1, "title": "Fixture", "phrases": phrases, "metadata": metadataJSON], options: [.sortedKeys])
    let descriptor = DeliveryPackage(key: "\(book)-v1", files: [.init(file: "manifest.json", bytes: manifest.count,
        sha256: SHA256.hash(data: manifest).map { String(format: "%02x", $0) }.joined())] + metadata + audio)
    return ([prefix + "AssetPackID": "fixture.duo", "BAAppGroupID": "group.example.fixture",
             prefix + "Descriptor": String(decoding: try JSONEncoder().encode(descriptor), as: UTF8.self),
             prefix + "Manifest": String(decoding: manifest, as: UTF8.self)], descriptor)
}
