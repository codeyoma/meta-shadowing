import Foundation
import StoreKit
import StoreKitTest
import Testing

/// Runs in a separate host process before the Apple service tests. On a cold
/// iOS 27 simulator, installing a fixture after launch does not reliably change
/// the purchase environment of that process. The next launch uses the fixture.
@MainActor
struct StoreKitFixtureSetupTests {
  @Test func installsLocalCatalogWithoutPurchasing() async throws {
    let bundle = Bundle(for: FixtureBundleMarker.self)
    let url = try #require(bundle.url(forResource: "Books", withExtension: "storekit"))
    let session = try SKTestSession(contentsOf: url)
    session.resetToDefaultState()
    session.clearTransactions()
    session.disableDialogs = true
    defer { session.clearTransactions() }

    let products = try await Product.products(for: ["com.example.packagestore.book"])
    let product = try #require(products.first, "Local StoreKit fixture did not load")
    #expect(product.id == "com.example.packagestore.book")
    #expect(product.displayName == "Test Learning Book")
    #expect(product.type == .nonConsumable)
    #expect(session.allTransactions().isEmpty)
  }
}

private final class FixtureBundleMarker: NSObject {}
