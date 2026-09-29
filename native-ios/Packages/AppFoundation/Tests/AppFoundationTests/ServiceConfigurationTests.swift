import Foundation
import Testing
@testable import AppFoundation

struct ServiceConfigurationTests {
    @Test func unconfiguredBuildDoesNotInventProductsOrDownloads() throws {
        let config = try ProductServiceConfiguration(values: [:], sampleRoot: URL(fileURLWithPath: "/unused"))
        #expect(config.productID.isEmpty)
        #expect(config.packages.isEmpty)
        #expect(config.books.isEmpty)
    }
    @Test func partialDeliveryConfigurationIsRejected() {
        #expect(throws: (any Error).self) {
            try ProductServiceConfiguration(values: ["SampleAssetPackID": "fictional-sample"], sampleRoot: URL(fileURLWithPath: "/unused"))
        }
    }
}
