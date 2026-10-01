#if DEBUG
import AppleServices
import Foundation

/// UUID-scoped UI fixtures never query a real account or perform cloud operations.
nonisolated struct ServiceTestCloud: CloudTransport {
    let available: Bool
    func account() async -> CloudAccount { available ? .available("local-ui-fixture") : .unavailable }
    func accountChanges() async -> AsyncStream<Void> { AsyncStream { $0.finish() } }
    func list(scope: String) async throws -> [CloudBackup] { throw ProgressCloudError.unavailable }
    func read(scope: String, id: String) async throws -> Data { throw ProgressCloudError.unavailable }
    func publish(scope: String, revision: Int64, payload: Data, base: String) async throws -> CloudPublication { throw ProgressCloudError.unavailable }
    func reset(scope: String, requestID: UUID, expectedGeneration: String?, payload: Data) async throws -> CloudPublication { throw ProgressCloudError.unavailable }
    func cleanupAdopted(scope: String, base: String, abandoned: String?) async throws -> Bool { throw ProgressCloudError.unavailable }
    func discardLocal(scope: String) async throws { }
    func stop() async { }
}
#endif
