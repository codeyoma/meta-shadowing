import Foundation
import StoreKit

enum TestBuildAccessPolicy {
  static func allows(development: Bool, verified: Bool, bundleMatches: Bool,
                     environment: AppStore.Environment?) -> Bool {
    development || (verified && bundleMatches && (environment == .sandbox || environment == .xcode))
  }
}

enum TestBuildAccess {
  static func verifiedAccess() async -> Bool {
    #if DEBUG || targetEnvironment(simulator)
    return true
    #else
    // The application transaction describes app distribution, unlike sandbox IAP purchases.
    // Never refresh: a failed/offline verification leaves the normal stage locks in place.
    do {
      guard case .verified(let transaction) = try await AppTransaction.shared,
            let bundle = Bundle.main.bundleIdentifier else { return false }
      return TestBuildAccessPolicy.allows(development: false, verified: true,
        bundleMatches: transaction.bundleID == bundle, environment: transaction.environment)
    } catch { return false }
    #endif
  }
}
