import Foundation
import LearningDomain

extension SQLiteLearningStore {
    public func readLanguageProgress(profileID: String, language: String, today: StudyDay) throws -> LanguageStudyProgress {
        _ = try ProfilePreferences(libraryLanguage: language).validated()
        let ledger = try readLedger(connection(profileID))
        let own = try RewardLedger(runs: ledger.runs.filter { $0.scope.profileID == profileID },
            completions: ledger.completions.filter { $0.scope.profileID == profileID },
            studyDays: ledger.studyDays.filter { $0.profileID == profileID },
            historicalAwards: ledger.historicalAwards.filter { $0.profileID == profileID })
        return try LanguageStudyProgress(xp: own.totalXP(language: language),
            streak: StudyDay.streak(days: Set(own.studyDays.filter { $0.language == language }.map(\.day)), today: today))
    }

    public func readCheckpoint(plan: LearningPlan) throws -> LearningSession? {
        let db = try connection(plan.scope.profileID)
        guard let row = try db.query("SELECT state FROM checkpoints WHERE package=? AND stage=?",
            [.text(plan.scope.packageKey), .integer(Int64(plan.scope.stage))]).first else { return nil }
        let saved: LearningSession
        if row["state"]?.data != nil { saved = try decode(LearningSession.self, row["state"]) }
        else {
            guard let imported = try importedBackup(db).checkpoint(for: plan) else { throw LearningStoreError.corrupt }
            saved = imported
        }
        guard saved.plan.sources == plan.sources else { throw LearningError.incompatibleCheckpoint }
        return try saved.validatedForRestore(expected: plan.scope, sourceCount: plan.sourceCount)
    }
}
