import Foundation
import Testing
import LearningDomain
@testable import LearningReference

func syntaxFixture(_ texts: [String] = ["I read."]) throws -> Data {
    let entries: [[String: Any]] = texts.enumerated().map { index, text in
        let words = text == "I read." ? ["I", "read", "."] : [text]
        let offsets = text == "I read." ? [0, 2, 6] : [0]
        return ["phraseNumber": index + 1, "text": text, "status": "complete", "error": NSNull(),
            "analysis": ["language": "en", "sentences": [["text": ["content": text, "beginOffset": 0]]],
                         "tokens": words.enumerated().map { i, word in
            ["text": ["content": word, "beginOffset": offsets[i]],
             "partOfSpeech": ["tag": i == 0 ? "PRON" : i == 1 ? "VERB" : "PUNCT"],
             "dependencyEdge": ["headTokenIndex": words.count == 1 ? 0 : 1,
                                "label": words.count == 1 || i == 1 ? "ROOT" : i == 0 ? "NSUBJ" : "P"]]
        }]]
    }
    return try JSONSerialization.data(withJSONObject: ["schemaVersion": 1, "complete": true,
        "encodingType": "UTF16", "language": "en", "entryCount": texts.count, "entries": entries])
}
func sources(_ texts: [String] = ["I read."]) -> [LearningSource] {
    texts.enumerated().map { LearningSource(index: $0.offset, text: $0.element, translation: "번역") }
}

struct SentenceAnalysisReaderTests {
    @Test(arguments: [[], [0, 0], [-1], [1]]) func rejectsInvalidSelection(_ indices: [Int]) throws {
        #expect(throws: (any Error).self) {
            try SentenceAnalysisReader.read(syntaxFixture(), sources: sources(), language: "en", sourceIndices: indices)
        }
    }
    @Test(arguments: ["schemaVersion", "complete", "encodingType", "language", "entryCount", "entries"])
    func rejectsIncompatibleDocument(_ field: String) throws {
        var doc = try #require(JSONSerialization.jsonObject(with: syntaxFixture()) as? [String: Any])
        doc[field] = NSNull()
        let data = try JSONSerialization.data(withJSONObject: doc)
        #expect(throws: (any Error).self) { try SentenceAnalysisReader.read(data, sources: sources(), language: "en", sourceIndices: [0]) }
    }
    @Test func preservesGroupedOrderAndUnicode() throws {
        let texts = ["😀 café e\u{301}", "I read."]
        let result = try SentenceAnalysisReader.read(syntaxFixture(texts), sources: sources(texts), language: "en", sourceIndices: [1, 0])
        #expect(result.map(\.id) == ["2:0", "1:0"])
        #expect(result[1].text == "😀 café e\u{301}")
    }
    @Test(arguments: ["source", "gap", "overlap", "head", "offset", "error", "missingError"])
    func rejectsCorruptUnselectedEntry(_ change: String) throws {
        var doc = try #require(JSONSerialization.jsonObject(with: syntaxFixture(["I read.", "I read."])) as? [String: Any])
        var entries = try #require(doc["entries"] as? [[String: Any]])
        var entry = entries[1]
        var analysis = try #require(entry["analysis"] as? [String: Any])
        var tokens = try #require(analysis["tokens"] as? [[String: Any]])
        switch change {
        case "source": entry["text"] = "Wrong"
        case "gap": tokens.removeFirst()
        case "overlap": tokens[1]["text"] = ["content": "I", "beginOffset": 0]
        case "head": tokens[0]["dependencyEdge"] = ["headTokenIndex": 99, "label": "NSUBJ"]
        case "offset": tokens[0]["text"] = ["content": "I", "beginOffset": Int.max]
        case "error": entry["error"] = "failed"
        default: entry.removeValue(forKey: "error")
        }
        analysis["tokens"] = tokens; entry["analysis"] = analysis; entries[1] = entry; doc["entries"] = entries
        let data = try JSONSerialization.data(withJSONObject: doc)
        #expect(throws: (any Error).self) {
            try SentenceAnalysisReader.read(data, sources: sources(["I read.", "I read."]), language: "en", sourceIndices: [0])
        }
    }
    @Test func readsSourceIdentityAndUTF16Spans() throws {
        let result = try SentenceAnalysisReader.read(syntaxFixture(), sources: sources(), language: "en", sourceIndices: [0])
        #expect(result.count == 1)
        #expect(result[0].id == "1:0")
        #expect(result[0].tokens.map(\.offset) == [0, 2, 6])
        #expect(result[0].tokens.map(\.head) == [1, 1, 1])
    }
}
