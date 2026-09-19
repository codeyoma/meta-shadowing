import Foundation

/// The caller supplies native StoreKit operations; JS cannot supply authorization.
struct PaidPackageDownload: Sendable {
  let download: PackageDownload
  let authorize: @Sendable () async -> (revision: Int, allowed: Bool)
  let publish: @Sendable (Int, () throws -> Void) throws -> Void

  func status(_ package: DeliveryPackage) async throws -> DeliveryStatus {
    guard await authorize().allowed else { throw DeliveryError.unauthorized }
    let value = try await download.status(package)
    guard await authorize().allowed else { throw DeliveryError.unauthorized }
    return value
  }
  func start(_ package: DeliveryPackage) async throws {
    let access = await authorize()
    guard access.allowed else { throw DeliveryError.unauthorized }
    try await download.start(package, publication: { commit in try publish(access.revision, commit) })
    let current = await authorize()
    guard current.allowed && current.revision == access.revision else { throw DeliveryError.unauthorized }
  }
}
