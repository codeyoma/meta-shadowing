import StoreKit
import Testing

struct TestBuildAccessTests {
  @Test func developmentAndVerifiedTestFlightOnly() {
    #expect(TestBuildAccessPolicy.allows(development: true, verified: false, bundleMatches: false, environment: nil))
    #expect(TestBuildAccessPolicy.allows(development: false, verified: true, bundleMatches: true, environment: .sandbox))
    #expect(!TestBuildAccessPolicy.allows(development: false, verified: true, bundleMatches: true, environment: .production))
    #expect(!TestBuildAccessPolicy.allows(development: false, verified: false, bundleMatches: true, environment: .sandbox))
    #expect(!TestBuildAccessPolicy.allows(development: false, verified: true, bundleMatches: false, environment: .sandbox))
    #expect(!TestBuildAccessPolicy.allows(development: false, verified: true, bundleMatches: true, environment: nil))
    #expect(TestBuildAccessPolicy.allows(development: false, verified: true, bundleMatches: true, environment: .xcode))
  }
}
