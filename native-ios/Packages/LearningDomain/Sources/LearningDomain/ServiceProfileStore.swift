import Foundation

public struct ServiceProfileLease: Equatable, Sendable {
    public let profileID: String
    public let scope: String?
    public let generation: UUID
    public init(profileID: String, scope: String?, generation: UUID) {
        self.profileID = profileID; self.scope = scope; self.generation = generation
    }
}
public struct ServiceProfileState: Codable, Equatable, Sendable {
    public var scope: String?
    public var generation: UUID
    public var enabled: Bool
    public var baseToken: String
    public var resetIntent: HistoryResetIntent?
    public var activated: Bool?
    public var learningGeneration: UUID?
    public var selectedScope: String?
    public var guestImportPending: Bool?
    public var writerGeneration: UUID { learningGeneration ?? generation }
    public init(scope: String? = nil, generation: UUID = UUID(), enabled: Bool = false, baseToken: String = "") {
        self.scope = scope; self.generation = generation; self.enabled = enabled; self.baseToken = baseToken
    }
}

public enum HistoryResetKind: String, Codable, Sendable { case local, cloud, remoteBoundary }
public struct HistoryResetIntent: Codable, Equatable, Sendable {
    public let requestID: UUID
    public let kind: HistoryResetKind
    public let expectedGeneration: String?
    public var acceptedGeneration: String?
    public init(requestID: UUID, kind: HistoryResetKind, expectedGeneration: String?, acceptedGeneration: String? = nil) {
        self.requestID = requestID; self.kind = kind; self.expectedGeneration = expectedGeneration
        self.acceptedGeneration = acceptedGeneration
    }
}

/// Service writes require the current account/profile capability, not just a profile string.
public protocol ServiceProfileStore: LearningStore {
    func activateService(scope: String?) async throws -> ServiceProfileLease
    func invalidateService(_ lease: ServiceProfileLease) async throws
    func serviceState(_ lease: ServiceProfileLease) async throws -> ServiceProfileState
    func setServiceConsent(_ enabled: Bool, lease: ServiceProfileLease) async throws
    func setGuestImportPending(_ pending: Bool, lease: ServiceProfileLease) async throws
    func selectedServiceScope() async throws -> String?
    func selectServiceScope(_ scope: String?) async throws
    func backupChanges(profileID: String) async throws -> AsyncStream<Int64>
    func exportServiceBackup(_ lease: ServiceProfileLease) async throws -> BackupSnapshot
    func mergeBackups(_ payloads: [Data], lease: ServiceProfileLease) async throws -> BackupSnapshot
    func acknowledgeService(_ lease: ServiceProfileLease, revision: Int64, baseToken: String) async throws
    func beginHistoryReset(_ kind: HistoryResetKind, requestID: UUID, lease: ServiceProfileLease) async throws -> HistoryResetIntent
    func acceptResetAuthority(requestID: UUID, generation: String, lease: ServiceProfileLease) async throws
    func adoptReset(_ payload: Data, lease: ServiceProfileLease, expectedGeneration: String?) async throws -> BackupSnapshot
    func removeLocalHistory(requestID: UUID, lease: ServiceProfileLease) async throws -> BackupSnapshot
    func finishHistoryReset(requestID: UUID, lease: ServiceProfileLease) async throws
}
