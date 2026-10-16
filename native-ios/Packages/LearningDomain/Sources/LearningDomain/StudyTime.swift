import Foundation

/// A grow-only contribution from one local database, independent of learning credit.
public struct StudyTimeCounter: Codable, Hashable, Sendable {
    public static let maximumMilliseconds: Int64 = 9_007_199_254_740_991
    public let language: String
    public let book: String
    public let replicaID: String
    public let milliseconds: Int64

    public init(language: String, book: String, replicaID: String, milliseconds: Int64) throws {
        guard LearningBackup.languages.contains(language),
              validIdentity(book), book.range(of: #"^[a-z0-9]+(?:-[a-z0-9]+)*$"#, options: .regularExpression) != nil,
              replicaID.range(of: #"^[a-z0-9]{1,100}$"#, options: .regularExpression) != nil,
              (0...Self.maximumMilliseconds).contains(milliseconds) else { throw LearningError.invalidState }
        self.language = language; self.book = book; self.replicaID = replicaID; self.milliseconds = milliseconds
    }
    private enum CodingKeys: CodingKey { case language, book, replicaID, milliseconds }
    public init(from decoder: any Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        try self.init(language: c.decode(String.self, forKey: .language), book: c.decode(String.self, forKey: .book),
                      replicaID: c.decode(String.self, forKey: .replicaID), milliseconds: c.decode(Int64.self, forKey: .milliseconds))
    }
    public static func merged(_ counters: [Self]) throws -> [Self] {
        struct Key: Hashable { let language: String; let book: String; let replica: String }
        var values: [Key: Self] = [:]
        for counter in counters {
            let key = Key(language: counter.language, book: counter.book, replica: counter.replicaID)
            if counter.milliseconds > (values[key]?.milliseconds ?? -1) { values[key] = counter }
        }
        let result = values.values.sorted {
            if $0.language != $1.language { return $0.language < $1.language }
            if $0.book != $1.book { return $0.book < $1.book }
            return $0.replicaID < $1.replicaID
        }
        var sums: [String: Int64] = [:]
        for value in result {
            let key = value.language + ":" + value.book
            guard value.milliseconds <= maximumMilliseconds - sums[key, default: 0] else { throw LearningError.invalidState }
            sums[key, default: 0] += value.milliseconds
        }
        return result
    }
    public static func total(_ counters: [Self], language: String, book: String) throws -> Int64 {
        try merged(counters).filter { $0.language == language && $0.book == book }.reduce(0) { $0 + $1.milliseconds }
    }
}

public struct StudyTimeLease: Codable, Equatable, Sendable {
    public let id: UUID
    public let handle: LearningHandle
    public let generation: UUID
    public init(id: UUID, handle: LearningHandle, generation: UUID) {
        self.id = id; self.handle = handle; self.generation = generation
    }
}

public struct StudyTimeReceipt: Equatable, Sendable {
    public let acceptedMilliseconds: Int64
    public let bookMilliseconds: Int64
    public let backupRevision: Int64
    public let retired: Bool
    public init(acceptedMilliseconds: Int64, bookMilliseconds: Int64, backupRevision: Int64, retired: Bool) {
        self.acceptedMilliseconds = acceptedMilliseconds; self.bookMilliseconds = bookMilliseconds
        self.backupRevision = backupRevision; self.retired = retired
    }
}
