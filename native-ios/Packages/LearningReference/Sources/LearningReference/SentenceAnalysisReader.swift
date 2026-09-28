import Foundation
import LearningDomain

public enum SentenceAnalysisReader {
    public static func read(_ data: Data, sources: [LearningSource], language: String,
                            sourceIndices: [Int]) throws -> [AnalysisSentence] {
        guard data.count <= 20_000_000, !sourceIndices.isEmpty,
              Set(sourceIndices).count == sourceIndices.count,
              sourceIndices.allSatisfy({ sources.indices.contains($0) }) else { throw AnalysisError.invalid }
        let document = try JSONDecoder().decode(Document.self, from: data)
        guard document.schemaVersion == 1, document.complete, document.encodingType == "UTF16",
              document.language == language, document.entryCount == sources.count,
              document.entries.count == sources.count, (1...100_000).contains(sources.count) else { throw AnalysisError.invalid }
        var selected: [Int: [AnalysisSentence]] = [:]
        let requested = Set(sourceIndices)
        for (index, entry) in document.entries.enumerated() {
            try Task.checkCancellation()
            guard entry.phraseNumber == index + 1, entry.status == "complete", entry.noError,
                  entry.analysis.language == language, !entry.text.isEmpty,
                  normalized(entry.text) == normalized(sources[index].text),
                  (1...1000).contains(entry.analysis.sentences.count),
                  (1...10_000).contains(entry.analysis.tokens.count) else { throw AnalysisError.invalid }
            let text = entry.text as NSString
            let sentences = entry.analysis.sentences.map(\.text)
            let tokens = entry.analysis.tokens
            try validateSpans(sentences, in: text)
            try validateSpans(tokens.map(\.text), in: text)
            var owners: [Int] = []
            var owner = 0
            for token in tokens {
                while owner < sentences.count && token.text.beginOffset >= sentences[owner].end { owner += 1 }
                guard owner < sentences.count, token.text.beginOffset >= sentences[owner].beginOffset,
                      token.text.end <= sentences[owner].end else { throw AnalysisError.invalid }
                owners.append(owner)
            }
            for (i, token) in tokens.enumerated() {
                guard tokens.indices.contains(token.dependencyEdge.headTokenIndex),
                      owners[token.dependencyEdge.headTokenIndex] == owners[i],
                      !token.partOfSpeech.tag.isEmpty, !token.dependencyEdge.label.isEmpty else { throw AnalysisError.invalid }
            }
            var cursor = 0
            var mapped: [AnalysisSentence] = []
            for (sentenceIndex, sentence) in sentences.enumerated() {
                let start = cursor
                while cursor < tokens.count && owners[cursor] == sentenceIndex { cursor += 1 }
                guard cursor > start else { throw AnalysisError.invalid }
                if requested.contains(index) {
                    mapped.append(AnalysisSentence(id: "\(index + 1):\(sentenceIndex)", sourceIndex: index,
                        text: sentence.content, tokens: tokens[start..<cursor].map {
                            AnalysisToken(text: $0.text.content, offset: $0.text.beginOffset - sentence.beginOffset,
                                pos: $0.partOfSpeech.tag, head: $0.dependencyEdge.headTokenIndex - start,
                                relation: $0.dependencyEdge.label)
                        }))
                }
            }
            if requested.contains(index) { selected[index] = mapped }
        }
        return sourceIndices.flatMap { selected[$0] ?? [] }
    }
    private static func normalized(_ text: String) -> String {
        text.split(whereSeparator: \.isWhitespace).joined(separator: " ")
    }
    private static func validateSpans(_ spans: [Span], in text: NSString) throws {
        var end = 0
        for span in spans {
            let length = (span.content as NSString).length
            guard length > 0, span.beginOffset >= end, span.beginOffset <= text.length,
                  length <= text.length - span.beginOffset,
                  text.substring(with: NSRange(location: span.beginOffset, length: length)) == span.content,
                  text.substring(with: NSRange(location: end, length: span.beginOffset - end))
                    .trimmingCharacters(in: .whitespacesAndNewlines).isEmpty else { throw AnalysisError.invalid }
            end = span.beginOffset + length
        }
        guard text.substring(from: end).trimmingCharacters(in: .whitespacesAndNewlines).isEmpty else { throw AnalysisError.invalid }
    }
    private struct Document: Decodable {
        let schemaVersion: Int, complete: Bool, encodingType: String, language: String, entryCount: Int
        let entries: [Entry]
    }
    private struct Entry: Decodable {
        let phraseNumber: Int, text: String, status: String, analysis: Analysis
        let noError: Bool
        enum CodingKeys: String, CodingKey { case phraseNumber, text, status, error, analysis }
        init(from decoder: any Decoder) throws {
            let c = try decoder.container(keyedBy: CodingKeys.self)
            phraseNumber = try c.decode(Int.self, forKey: .phraseNumber)
            text = try c.decode(String.self, forKey: .text)
            status = try c.decode(String.self, forKey: .status)
            noError = try c.decodeNil(forKey: .error)
            analysis = try c.decode(Analysis.self, forKey: .analysis)
        }
    }
    private struct Analysis: Decodable {
        let language: String, sentences: [Sentence], tokens: [Token]
    }
    private struct Span: Decodable {
        let content: String, beginOffset: Int
        // Called only after validateSpans proves this addition fits within the source.
        var end: Int { beginOffset + (content as NSString).length }
    }
    private struct Sentence: Decodable { let text: Span }
    private struct Token: Decodable {
        let text: Span, partOfSpeech: POS, dependencyEdge: Edge
    }
    private struct POS: Decodable { let tag: String }
    private struct Edge: Decodable { let headTokenIndex: Int, label: String }
}
