import Foundation
import LearningDomain

public struct StageStudySummary: Equatable, Sendable {
    public let unit: Int
    public let unitCount: Int
    public let confirmed: Int
    public let planned: Int
    public let complete: Bool
    init(_ session: LearningSession) {
        unit = session.unit; unitCount = session.unitCount
        confirmed = session.current.confirmed; planned = session.current.planned
        complete = session.phase == .complete
    }
}
public struct BookStudySummary: Identifiable, Equatable, Sendable {
    public var id: String { book.id }
    public let book: CatalogBook
    public let completedRuns: [Int: Int]
    public let checkpoints: [Int: StageStudySummary]
    public let available: Bool
    public var completedStages: Int { completedRuns.values.filter { $0 >= 3 }.count }
    public var currentStage: Int { (1...16).first { completedRuns[$0, default: 0] < 3 } ?? 16 }
}
public struct ProductSnapshot: Equatable, Sendable {
    public let preferences: ProfilePreferences
    public let progress: LanguageStudyProgress
    public let books: [BookStudySummary]
    public var selectedBook: BookStudySummary? {
        if let key = preferences.libraryPackageKey { return books.first { $0.id == key } }
        return books.first
    }
}
public struct OpenedLesson: Sendable {
    public let controller: LearningController
    public let initial: LearningControllerState
    public let materials: BookMaterials
}

public actor ProductWorkspace {
    private let store: any LearningStore
    private let catalog: any ProductCatalog
    private let profileID: String
    private let now: @Sendable () -> Date
    private let calendar: Calendar
    private var writing = false
    public init(store: any LearningStore, catalog: any ProductCatalog, profileID: String,
                now: @escaping @Sendable () -> Date = Date.init, calendar: Calendar = .current) {
        self.store = store; self.catalog = catalog; self.profileID = profileID
        self.now = now; self.calendar = calendar
    }
    public func load() async throws -> ProductSnapshot {
        let preferences = try await store.preferences(profileID: profileID)
        let language = preferences.libraryLanguage ?? "english"
        let today = try StudyDay.at(now(), calendar: calendar)
        let progress = try await store.readLanguageProgress(profileID: profileID, language: language, today: today)
        var summaries: [BookStudySummary] = []
        for book in try await catalog.books() where book.language == language {
            try Task.checkCancellation()
            let scope = try scope(book, stage: 1)
            let progress = try await store.readProgress(scope: scope, today: today)
            var checkpoints: [Int: StageStudySummary] = [:]
            var available = await catalog.permitsPractice(packageKey: book.id)
            if available {
                do {
                    let material = try await catalog.materials(packageKey: book.id)
                    for stage in 1...16 {
                        let plan = try plan(material, stage: stage, preferences: preferences.learning)
                        if let saved = try await store.readCheckpoint(plan: plan) {
                            checkpoints[stage] = StageStudySummary(saved)
                        }
                    }
                } catch is CancellationError { throw CancellationError() }
                catch { available = false }
            }
            summaries.append(BookStudySummary(book: book, completedRuns: progress.completedRuns,
                                              checkpoints: checkpoints, available: available))
        }
        try Task.checkCancellation()
        return ProductSnapshot(preferences: preferences, progress: progress, books: summaries)
    }
    public func select(language: String, packageKey: String?) async throws -> ProductSnapshot {
        guard !writing else { throw ProductError.busy }
        writing = true; defer { writing = false }
        var preferences = try await store.preferences(profileID: profileID)
        let book: CatalogBook?
        if let packageKey {
            book = try await catalog.books().first { $0.id == packageKey && $0.language == language }
            guard book != nil else { throw ProductError.unavailable }
        } else { book = nil }
        preferences.libraryLanguage = language
        preferences.libraryPackageKey = book?.id; preferences.libraryBook = book?.book
        try Task.checkCancellation()
        _ = try await store.savePreferences(preferences, profileID: profileID)
        return try await load()
    }
    public func saveLearningPreferences(_ value: LearningPreferences) async throws -> ProductSnapshot {
        guard !writing else { throw ProductError.busy }
        writing = true; defer { writing = false }
        var preferences = try await store.preferences(profileID: profileID)
        preferences.learning = try value.validated()
        try Task.checkCancellation()
        _ = try await store.savePreferences(preferences, profileID: profileID)
        return try await load()
    }
    public func openLesson(packageKey: String, stage: Int, verifiedTestAccess: Bool) async throws -> OpenedLesson {
        guard await catalog.permitsPractice(packageKey: packageKey) else { throw ProductError.denied }
        let material = try await catalog.materials(packageKey: packageKey)
        let preferences = try await store.preferences(profileID: profileID)
        let scope = try scope(material.book, stage: stage)
        let progress = try await store.readProgress(scope: scope, today: StudyDay.at(now(), calendar: calendar))
        guard StageProgress.canOpen(stage: stage, completedRuns: progress.completedRuns, verifiedTestAccess: verifiedTestAccess),
              await catalog.permitsPractice(packageKey: packageKey) else { throw ProductError.denied }
        try Task.checkCancellation()
        let snapshot = try await store.open(plan: plan(material, stage: stage, preferences: preferences.learning),
                                            preferences: preferences.learning, writerID: UUID())
        if Task.isCancelled {
            await store.revoke(writerID: snapshot.handle.writerID)
            throw CancellationError()
        }
        let controller = LearningController(store: store, snapshot: snapshot)
        return OpenedLesson(controller: controller, initial: await controller.state, materials: material)
    }
    public func permitsPractice(_ scope: LearningScope) async -> Bool {
        guard scope.profileID == profileID else { return false }
        return await catalog.permitsPractice(packageKey: scope.packageKey)
    }
    private func scope(_ book: CatalogBook, stage: Int) throws -> LearningScope {
        try LearningScope(profileID: profileID, packageKey: book.id, language: book.language, book: book.book, stage: stage)
    }
    private func plan(_ materials: BookMaterials, stage: Int, preferences: LearningPreferences) throws -> LearningPlan {
        try LearningPlan.make(scope: scope(materials.book, stage: stage), runID: UUID().uuidString,
                              sources: materials.sources, groupSize: preferences.groupSize)
    }
}
