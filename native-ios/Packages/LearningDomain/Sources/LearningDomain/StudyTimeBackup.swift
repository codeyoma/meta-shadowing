import Foundation

extension LearningBackup {
    public mutating func setStudyTimeCounters(_ values: [StudyTimeCounter]) throws {
        studyTimeCounters = try StudyTimeCounter.merged(values)
    }
    public func studyMilliseconds(language: String, book: String) throws -> Int64 {
        try StudyTimeCounter.total(studyTimeCounters, language: language, book: book)
    }
    public func withResetGeneration(_ generation: String?) throws -> Self {
        guard generation.map({ $0.count == 36 && UUID(uuidString: $0) != nil }) ?? true else { throw LearningError.invalidState }
        var result = self
        result.resetGeneration = generation
        return result
    }
}
