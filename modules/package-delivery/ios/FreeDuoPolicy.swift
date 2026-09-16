import Foundation

enum FreeDuoPolicy {
  static func allows(enabled: Bool, development: Bool, receiptName: String?) -> Bool {
    enabled && (development || receiptName == "sandboxReceipt")
  }

  static var current: Bool {
    #if DEBUG || targetEnvironment(simulator)
    let development = true
    #else
    let development = false
    #endif
    // This is a test-distribution guard, never evidence of a paid entitlement.
    // Unknown environments fail closed, including a promoted App Store binary.
    return allows(enabled: Bundle.main.object(forInfoDictionaryKey: "FreeDuoEnabled") as? Bool == true,
      development: development, receiptName: Bundle.main.appStoreReceiptURL?.lastPathComponent)
  }
}
