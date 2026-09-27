import Foundation

public enum LearningError: Error, Equatable, Sendable {
    case invalidIdentity, invalidPlan, invalidState, invalidPreferences, invalidEvent, incompatibleCheckpoint
}

func validIdentity(_ value: String, limit: Int = 200) -> Bool {
    !value.isEmpty && value.utf16.count <= limit
        && value == value.trimmingCharacters(in: .whitespacesAndNewlines)
        && !value.unicodeScalars.contains { $0.value < 32 }
}

public struct LearningScope: Codable, Hashable, Sendable {
    public let profileID: String
    public let packageKey: String
    public let language: String
    public let book: String
    public let stage: Int

    public init(profileID: String, packageKey: String, language: String, book: String, stage: Int) throws {
        guard [profileID, packageKey, language, book].allSatisfy({ validIdentity($0) }),
              (1...16).contains(stage), LearningBackup.languages.contains(language),
              book.range(of: #"^[a-z0-9]+(?:-[a-z0-9]+)*$"#, options: .regularExpression) != nil,
              packageKey.hasPrefix(book + "-v") else { throw LearningError.invalidIdentity }
        let version = String(packageKey.dropFirst(book.utf8.count + 2))
        guard !version.isEmpty, version.first != "0", version.allSatisfy({ $0.isASCII && $0.isNumber }),
              let number = Int64(version), number <= 9_007_199_254_740_991 else { throw LearningError.invalidIdentity }
        self.profileID = profileID; self.packageKey = packageKey
        self.language = language; self.book = book; self.stage = stage
    }

    public init(from decoder: any Decoder) throws {
        let values = try decoder.container(keyedBy: CodingKeys.self)
        try self.init(profileID: values.decode(String.self, forKey: .profileID),
                      packageKey: values.decode(String.self, forKey: .packageKey),
                      language: values.decode(String.self, forKey: .language),
                      book: values.decode(String.self, forKey: .book), stage: values.decode(Int.self, forKey: .stage))
    }
}
