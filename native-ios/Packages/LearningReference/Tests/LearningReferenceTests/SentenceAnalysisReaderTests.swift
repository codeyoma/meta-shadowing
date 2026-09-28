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
    @Test func nonzeroOffsetsCountUTF16NotCharacters() throws {
        let text = "😀 read e\u{301}."
        var doc = try #require(JSONSerialization.jsonObject(with: syntaxFixture([text])) as? [String: Any])
        var entries = try #require(doc["entries"] as? [[String: Any]])
        var analysis = try #require(entries[0]["analysis"] as? [String: Any])
        var tokens: [[String: Any]] = zip(["😀", "read", "e\u{301}", "."], [0, 3, 8, 10]).enumerated().map { i, pair in
            ["text": ["content": pair.0, "beginOffset": pair.1], "partOfSpeech": ["tag": "X"],
             "dependencyEdge": ["headTokenIndex": 1, "label": i == 1 ? "ROOT" : "DEP"]]
        }
        analysis["tokens"] = tokens; entries[0]["analysis"] = analysis; doc["entries"] = entries
        let data = try JSONSerialization.data(withJSONObject: doc)
        let result = try SentenceAnalysisReader.read(data, sources: sources([text]), language: "en", sourceIndices: [0])
        #expect(result[0].tokens.map(\.offset) == [0, 3, 8, 10])
        tokens[2]["text"] = ["content": "e\u{301}", "beginOffset": 7]
        analysis["tokens"] = tokens; entries[0]["analysis"] = analysis; doc["entries"] = entries
        let invalid = try JSONSerialization.data(withJSONObject: doc)
        #expect(throws: (any Error).self) {
            try SentenceAnalysisReader.read(invalid, sources: sources([text]), language: "en", sourceIndices: [0])
        }
    }
    @Test func sourceMatchingDoesNotNormalizeUnicodeCodeUnits() throws {
        #expect(throws: (any Error).self) {
            try SentenceAnalysisReader.read(syntaxFixture(["café"]), sources: sources(["cafe\u{301}"]), language: "en", sourceIndices: [0])
        }
    }
    @Test func sentenceHeadsAreRebasedAndCannotCrossSentences() throws {
        let raw = #"{"schemaVersion":1,"complete":true,"encodingType":"UTF16","language":"en","entryCount":1,"entries":[{"phraseNumber":1,"text":"Birds fly. Fish swim.","status":"complete","error":null,"analysis":{"language":"en","sentences":[{"text":{"content":"Birds fly.","beginOffset":0}},{"text":{"content":"Fish swim.","beginOffset":11}}],"tokens":[{"text":{"content":"Birds","beginOffset":0},"partOfSpeech":{"tag":"NOUN"},"dependencyEdge":{"headTokenIndex":1,"label":"NSUBJ"}},{"text":{"content":"fly","beginOffset":6},"partOfSpeech":{"tag":"VERB"},"dependencyEdge":{"headTokenIndex":1,"label":"ROOT"}},{"text":{"content":".","beginOffset":9},"partOfSpeech":{"tag":"PUNCT"},"dependencyEdge":{"headTokenIndex":1,"label":"P"}},{"text":{"content":"Fish","beginOffset":11},"partOfSpeech":{"tag":"NOUN"},"dependencyEdge":{"headTokenIndex":4,"label":"NSUBJ"}},{"text":{"content":"swim","beginOffset":16},"partOfSpeech":{"tag":"VERB"},"dependencyEdge":{"headTokenIndex":4,"label":"ROOT"}},{"text":{"content":".","beginOffset":20},"partOfSpeech":{"tag":"PUNCT"},"dependencyEdge":{"headTokenIndex":4,"label":"P"}}]}}]}"#
        let phrases = sources(["Birds fly. Fish swim."])
        let result = try SentenceAnalysisReader.read(Data(raw.utf8), sources: phrases, language: "en", sourceIndices: [0])
        #expect(result.map(\.id) == ["1:0", "1:1"])
        #expect(result[1].tokens.map(\.offset) == [0, 5, 9])
        #expect(result[1].tokens.map(\.head) == [1, 1, 1])
        let bad = raw.replacingOccurrences(of: #""headTokenIndex":1,"label":"NSUBJ""#, with: #""headTokenIndex":4,"label":"NSUBJ""#)
        #expect(throws: (any Error).self) {
            try SentenceAnalysisReader.read(Data(bad.utf8), sources: phrases, language: "en", sourceIndices: [0])
        }
    }
    @Test func malformedAndOversizedInputFailsClosed() {
        for data in [Data("{".utf8), Data(repeating: 32, count: 20_000_001)] {
            #expect(throws: (any Error).self) { try SentenceAnalysisReader.read(data, sources: sources(), language: "en", sourceIndices: [0]) }
        }
    }
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
