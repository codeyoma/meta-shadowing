#if DEBUG
import Foundation
import AppFoundation
import LearningDomain
import LearningMedia
import LearningPersistence

/// Only injected for a validated, isolated UI-test profile. Never compiled into Release.
actor ProductTestCatalog: ProductCatalog {
    private let root: URL
    private let mode: String
    private var materialsTask: Task<BookMaterials, any Error>?
    init(root: URL, mode: String) { self.root = root; self.mode = mode }
    func books() -> [CatalogBook] {
        [CatalogBook(id: "ui-fixture-v1", book: "ui-fixture", language: "english",
                     title: mode == "long" ? "A long book title that wraps naturally · 긴 제목도 끝까지 읽을 수 있어요" : "Native UI fixture",
                     sentenceCount: 2)]
    }
    func permitsPractice(packageKey: String) -> Bool { packageKey == "ui-fixture-v1" }
    func materials(packageKey: String) async throws -> BookMaterials {
        guard packageKey == "ui-fixture-v1" else { throw ProductError.denied }
        if let materialsTask { return try await materialsTask.value }
        let book = books()[0], root = root, mode = mode
        let task = Task {
            let media = try await SyntheticMediaFixtures.create(in: root, video: mode == "video" || mode == "video-long").map {
                switch $0 {
                case let .audio(file): BookMediaAsset.audio(file: file)
                case let .video(file, start, end): BookMediaAsset.video(file: file, start: start, end: end)
                }
            }
            let long = mode == "long" || mode == "video-long"
            return BookMaterials(book: book, root: root, sources: [
                .init(index: 0, text: long ? String(repeating: "Secret bilingual practice. ", count: 40) : "Secret one",
                      translation: long ? String(repeating: "긴 문장을 천천히 연습해요. ", count: 40) : "하나"),
                .init(index: 1, text: "Secret two", translation: "둘")
            ], media: media)
        }
        materialsTask = task
        do { return try await task.value } catch { materialsTask = nil; throw error }
    }
}

/// Fault injection remains at the persistence boundary; transactions still use real SQLite.
actor ProductTestStore: LearningStore {
    let underlying: SQLiteLearningStore
    private var failNextSave = true
    init(root: URL) { underlying = SQLiteLearningStore(root: root) }
    func apply(_ command: LearningCommand) async throws -> CommitReceipt {
        if failNextSave {
            switch command.event {
            case .confirm, .next, .changeRate, .regroup:
                failNextSave = false; throw LearningStoreError.injectedFailure
            default: break
            }
        }
        return try await underlying.apply(command)
    }
    func open(plan: LearningPlan, preferences: LearningPreferences, writerID: UUID) async throws -> LearningSnapshot {
        try await underlying.open(plan: plan, preferences: preferences, writerID: writerID)
    }
    func readProgress(scope: LearningScope, today: StudyDay) async throws -> LearningProgress { try await underlying.readProgress(scope: scope, today: today) }
    func readLanguageProgress(profileID: String, language: String, today: StudyDay) async throws -> LanguageStudyProgress {
        try await underlying.readLanguageProgress(profileID: profileID, language: language, today: today)
    }
    func readCheckpoint(plan: LearningPlan) async throws -> LearningSession? { try await underlying.readCheckpoint(plan: plan) }
    func preferences(profileID: String) async throws -> ProfilePreferences { try await underlying.preferences(profileID: profileID) }
    func savePreferences(_ value: ProfilePreferences, profileID: String) async throws -> Int64 { try await underlying.savePreferences(value, profileID: profileID) }
    func revoke(profileID: String) async { await underlying.revoke(profileID: profileID) }
    func revoke(writerID: UUID) async { await underlying.revoke(writerID: writerID) }
    func exportBackup(profileID: String) async throws -> BackupSnapshot { try await underlying.exportBackup(profileID: profileID) }
    func mergeBackup(_ data: Data, profileID: String) async throws -> BackupSnapshot { try await underlying.mergeBackup(data, profileID: profileID) }
    func restoreIntoEmptyProfile(_ data: Data, profileID: String) async throws -> BackupSnapshot { try await underlying.restoreIntoEmptyProfile(data, profileID: profileID) }
    func acknowledgeBackup(profileID: String, revision: Int64) async throws { try await underlying.acknowledgeBackup(profileID: profileID, revision: revision) }
}
#endif
