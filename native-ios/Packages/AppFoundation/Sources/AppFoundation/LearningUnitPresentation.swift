import Foundation
import LearningDomain

public struct LearningTextSpan: Equatable, Sendable {
    public let text: String
    public let visible: Bool
}
public struct LearningTextLine: Identifiable, Equatable, Sendable {
    public let id: String
    public let sourceIndex: Int
    public let kind: RevealLine.Kind
    public let spans: [LearningTextSpan]
    public let hint: String?
    public var accessibleText: String {
        hint ?? spans.filter(\.visible).map(\.text).joined().trimmingCharacters(in: .whitespacesAndNewlines)
    }
}
public struct LearningTextBubble: Identifiable, Equatable, Sendable {
    public let id: String
    public let lines: [LearningTextLine]
}
public struct LearningUnitPresentation: Equatable, Sendable {
    public let bubbles: [LearningTextBubble]
    public var lines: [LearningTextLine] { bubbles.flatMap(\.lines) }
    public static func make(session: LearningSession, revealOriginal: Bool, elapsedSeconds: Double) throws -> Self {
        let policy = try StagePolicy.forStage(session.plan.scope.stage)
        if session.isSilent {
            let source = session.plan.sources[session.unit]
            let lines = try RevealTimeline.lines(source: source, stage: session.plan.scope.stage)
            let visibility = try RevealTimeline.visible(lines: lines, seconds: elapsedSeconds,
                WPM: session.reveal?.WPM ?? 150, completed: session.phase == .speaking || session.phase == .decision || session.phase == .complete)
            return Self(bubbles: [LearningTextBubble(id: "\(source.index)-0", lines: visibility.map { line in
                LearningTextLine(id: "\(source.index)-\(line.kind.rawValue)", sourceIndex: source.index, kind: line.kind,
                    spans: line.spans.map { LearningTextSpan(text: $0.text, visible: $0.visible) }, hint: nil)
            })])
        }
        return Self(bubbles: session.currentSources.flatMap { index in
            let source = session.plan.sources[index]
            let originals = quoted(source.text), translations = quoted(source.translation)
            let pairs: [(String, String)]
            if let originals, let translations, originals.count == translations.count { pairs = Array(zip(originals, translations)) }
            else { pairs = [(source.text, source.translation)] }
            return pairs.enumerated().map { ordinal, pair in
                LearningTextBubble(id: "\(index)-\(ordinal)", lines: [
                LearningTextLine(id: "\(index)-\(ordinal)-target", sourceIndex: index, kind: .target,
                    spans: [.init(text: pair.0, visible: revealOriginal || !policy.firstWordHints)],
                    hint: !revealOriginal && policy.firstWordHints ? LearningText.firstWordHint(pair.0) : nil),
                LearningTextLine(id: "\(index)-\(ordinal)-translation", sourceIndex: index, kind: .translation,
                    spans: [.init(text: pair.1, visible: true)], hint: nil)
            ]) }
        })
    }
    private static func quoted(_ text: String) -> [String]? {
        var cursor = text.startIndex
        var result: [String] = []
        while cursor < text.endIndex {
            while cursor < text.endIndex && text[cursor].isWhitespace { cursor = text.index(after: cursor) }
            if cursor == text.endIndex { break }
            let opening = text[cursor]
            guard opening == "\"" || opening == "“" else { return nil }
            let closing: Character = opening == "“" ? "”" : "\""
            cursor = text.index(after: cursor)
            let start = cursor
            while cursor < text.endIndex && text[cursor] != closing {
                if opening == "\"", text[cursor] == "\\" {
                    cursor = text.index(after: cursor)
                    guard cursor < text.endIndex else { return nil }
                }
                cursor = text.index(after: cursor)
            }
            guard cursor < text.endIndex else { return nil }
            let part = text[start..<cursor].trimmingCharacters(in: .whitespacesAndNewlines)
            guard !part.isEmpty else { return nil }
            result.append(part); cursor = text.index(after: cursor)
        }
        return result.isEmpty ? nil : result
    }
}
