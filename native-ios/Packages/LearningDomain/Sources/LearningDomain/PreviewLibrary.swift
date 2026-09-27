import Foundation

/// Synthetic preview content, not an installed package or purchase entitlement.
public struct PreviewLibrary: Codable, Equatable, Sendable {
    public let schemaVersion: Int
    public let lessons: [PreviewLesson]

    public init(from decoder: any Decoder) throws {
        let values = try decoder.container(keyedBy: CodingKeys.self)
        schemaVersion = try values.decode(Int.self, forKey: .schemaVersion)
        lessons = try values.decode([PreviewLesson].self, forKey: .lessons)
        guard schemaVersion == 1, !lessons.isEmpty,
              Set(lessons.map(\.id)).count == lessons.count,
              lessons.allSatisfy({ lesson in
                  [lesson.id, lesson.title].allSatisfy(Self.hasText)
                      && !lesson.sentences.isEmpty
                      && Set(lesson.sentences.map(\.id)).count == lesson.sentences.count
                      && lesson.sentences.allSatisfy { sentence in
                          [sentence.id, sentence.source, sentence.translation].allSatisfy(Self.hasText)
                      }
              }) else { throw CocoaError(.coderReadCorrupt) }
    }

    public static func decode(_ data: Data) throws -> Self {
        try JSONDecoder().decode(Self.self, from: data)
    }

    private static func hasText(_ value: String) -> Bool {
        !value.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
    }
}

public struct PreviewLesson: Codable, Hashable, Identifiable, Sendable {
    public let id: String
    public let title: String
    public let sentences: [PreviewSentence]
}

public struct PreviewSentence: Codable, Hashable, Identifiable, Sendable {
    public let id: String
    public let source: String
    public let translation: String
}
