#if DEBUG
import Foundation
import LearningDomain

/// Public synthetic syntax for native UI tests, never a fallback for real content.
nonisolated enum ReferenceTestSyntax {
    static func data(_ sources: [LearningSource]) throws -> Data {
        let entries: [[String: Any]] = sources.map { source in
            let words = source.text.split(separator: " ").map(String.init)
            var offset = 0
            let tokens: [[String: Any]] = words.enumerated().map { i, word in
                defer { offset += word.utf16.count + 1 }
                return ["text": ["content": word, "beginOffset": offset], "partOfSpeech": ["tag": "NOUN"],
                        "dependencyEdge": ["headTokenIndex": 0, "label": i == 0 ? "ROOT" : "NN"]]
            }
            return ["phraseNumber": source.index + 1, "text": source.text, "status": "complete", "error": NSNull(),
                    "analysis": ["language": "en", "sentences": [["text": ["content": source.text, "beginOffset": 0]]], "tokens": tokens]]
        }
        return try JSONSerialization.data(withJSONObject: ["schemaVersion": 1, "complete": true, "encodingType": "UTF16",
            "language": "en", "entryCount": sources.count, "entries": entries])
    }
}
#endif
