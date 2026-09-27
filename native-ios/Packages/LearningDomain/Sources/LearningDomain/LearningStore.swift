import Foundation

public enum LearningStoreError: Error, Equatable, Sendable {
    case sqlite(Int32), corrupt, unsupportedSchema, staleWriter, commandConflict, invalidProfile, revisionExhausted, injectedFailure
}
public struct LearningHandle: Codable, Equatable, Sendable {
    public let writerID: UUID
    public let scope: LearningScope
    public let planID: String
    public init(writerID: UUID, scope: LearningScope, planID: String) {
        self.writerID = writerID; self.scope = scope; self.planID = planID
    }
}
public struct LearningCommand: Codable, Equatable, Sendable {
    public let handle: LearningHandle
    public let id: UUID
    public let expectedVersion: Int64
    public let event: LearningEvent
    public init(handle: LearningHandle, id: UUID, expectedVersion: Int64, event: LearningEvent) {
        self.handle = handle; self.id = id; self.expectedVersion = expectedVersion; self.event = event
    }
}
public struct LearningSnapshot: Codable, Equatable, Sendable {
    public let handle: LearningHandle
    public let writerVersion: Int64
    public let session: LearningSession
    public let progress: LearningProgress
    public init(handle: LearningHandle, writerVersion: Int64, session: LearningSession, progress: LearningProgress) {
        self.handle = handle; self.writerVersion = writerVersion; self.session = session; self.progress = progress
    }
}
public struct CommitReceipt: Codable, Equatable, Sendable {
    public enum Disposition: String, Codable, Sendable { case applied, duplicate, ignored }
    public let snapshot: LearningSnapshot
    public let backupRevision: Int64
    public let earnedXP: Int64
    public let disposition: Disposition
    public init(snapshot: LearningSnapshot, backupRevision: Int64, earnedXP: Int64, disposition: Disposition) {
        self.snapshot = snapshot; self.backupRevision = backupRevision; self.earnedXP = earnedXP; self.disposition = disposition
    }
}
public struct ProfilePreferences: Codable, Equatable, Sendable {
    public var learning: LearningPreferences
    public var libraryLanguage: String?
    public var libraryBook: String?
    public var libraryPackageKey: String?
    public init(learning: LearningPreferences = .fresh, libraryLanguage: String? = "english", libraryBook: String? = nil, libraryPackageKey: String? = nil) {
        self.learning = learning; self.libraryLanguage = libraryLanguage; self.libraryBook = libraryBook
        self.libraryPackageKey = libraryPackageKey
    }
    public func validated() throws -> Self {
        _ = try learning.validated()
        guard libraryLanguage.map({ LearningBackup.languages.contains($0) }) ?? (libraryBook == nil && libraryPackageKey == nil), libraryBook.map({ validIdentity($0) }) ?? true,
              libraryPackageKey.map({ validIdentity($0) && libraryBook != nil }) ?? true else {
            throw LearningError.invalidPreferences
        }
        var normalized = self
        // A cleared selection is a clocked default-language row, not an unmergeable deletion.
        normalized.libraryLanguage = libraryLanguage ?? "english"
        return normalized
    }
    private enum CodingKeys: String, CodingKey { case learning, libraryLanguage, libraryBook, libraryPackageKey }
    public init(from decoder: any Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        learning = try c.decode(LearningPreferences.self, forKey: .learning)
        libraryLanguage = try c.decodeIfPresent(String.self, forKey: .libraryLanguage)
        libraryBook = try c.decodeIfPresent(String.self, forKey: .libraryBook)
        libraryPackageKey = try c.decodeIfPresent(String.self, forKey: .libraryPackageKey)
        self = try validated()
    }
}
public protocol LearningStore: Actor {
    func open(plan: LearningPlan, preferences: LearningPreferences, writerID: UUID) async throws -> LearningSnapshot
    func apply(_ command: LearningCommand) async throws -> CommitReceipt
    func readProgress(scope: LearningScope, today: StudyDay) async throws -> LearningProgress
    func preferences(profileID: String) async throws -> ProfilePreferences
    func savePreferences(_ value: ProfilePreferences, profileID: String) async throws -> Int64
    func revoke(profileID: String) async
    func exportBackup(profileID: String) async throws -> BackupSnapshot
    func mergeBackup(_ data: Data, profileID: String) async throws -> BackupSnapshot
    func restoreIntoEmptyProfile(_ data: Data, profileID: String) async throws -> BackupSnapshot
    func acknowledgeBackup(profileID: String, revision: Int64) async throws
}
public struct BackupSnapshot: Equatable, Sendable {
    public let payload: Data
    public let revision: Int64
    public let acknowledgedRevision: Int64
    public let resetGeneration: String?
    public init(payload: Data, revision: Int64, acknowledgedRevision: Int64, resetGeneration: String?) {
        self.payload = payload; self.revision = revision; self.acknowledgedRevision = acknowledgedRevision; self.resetGeneration = resetGeneration
    }
}
