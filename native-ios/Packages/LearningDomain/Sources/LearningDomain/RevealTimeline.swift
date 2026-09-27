import Foundation

public struct RevealLine: Equatable, Sendable {
    public enum Kind: String, Sendable { case target, translation }
    public let kind: Kind
    public let text: String
    public let offset: Int
    public let words: Int
}
public struct RevealLineVisibility: Equatable, Sendable {
    public struct Span: Equatable, Sendable { public let text: String; public let visible: Bool }
    public let kind: RevealLine.Kind
    public let spans: [Span]
    public var visibleText: String {
        spans.filter(\.visible).map(\.text).joined().trimmingCharacters(in: RevealTimeline.whitespace)
    }
}

public enum RevealTimeline {
    // ECMA whitespace preserves the reference behavior, including BOM and excluding NEL.
    static let whitespace = CharacterSet(charactersIn: "\t\n\u{000B}\u{000C}\r \u{00A0}\u{1680}\u{2000}\u{2001}\u{2002}\u{2003}\u{2004}\u{2005}\u{2006}\u{2007}\u{2008}\u{2009}\u{200A}\u{2028}\u{2029}\u{202F}\u{205F}\u{3000}\u{FEFF}")
    private static func tokens(_ text: String) -> [(text: String, word: Bool)] {
        var result: [(text: String, word: Bool)] = []
        for scalar in text.unicodeScalars {
            let word = !whitespace.contains(scalar)
            if let last = result.last, last.word == word { result[result.count - 1].text.unicodeScalars.append(scalar) }
            else { result.append((String(scalar), word)) }
        }
        return result
    }
    public static func lines(source: LearningSource, stage: Int) throws -> [RevealLine] {
        guard let order = try StagePolicy.forStage(stage).revealOrder else { throw LearningError.invalidEvent }
        let target: (RevealLine.Kind, String) = (.target, source.text)
        let translation: (RevealLine.Kind, String) = (.translation, source.translation)
        let ordered = switch order {
        case .targetFirst: [target, translation]
        case .translationFirst: [translation, target]
        case .translationOnly: [translation]
        }
        var offset = 0
        return ordered.compactMap { kind, text in
            let words = tokens(text).filter(\.word).count
            guard words > 0 else { return nil }
            defer { offset += words }
            return RevealLine(kind: kind, text: text, offset: offset, words: words)
        }
    }
    public static func visible(lines: [RevealLine], seconds: Double, WPM: Int, completed: Bool) throws -> [RevealLineVisibility] {
        guard seconds.isFinite, seconds >= 0, (1...999).contains(WPM) else { throw LearningError.invalidEvent }
        let count = completed ? Double.infinity : floor(seconds * Double(WPM) / 60 + 1e-9)
        return lines.map { line in
            var ordinal = line.offset
            return RevealLineVisibility(kind: line.kind, spans: tokens(line.text).map { token in
                if token.word { ordinal += 1 }
                return .init(text: token.text, visible: Double(ordinal) <= count)
            })
        }
    }
    public static func duration(lines: [RevealLine], WPM: Int) throws -> Double {
        guard (1...999).contains(WPM) else { throw LearningError.invalidEvent }
        return Double(max(1, lines.reduce(0) { $0 + $1.words })) * 60 / Double(WPM)
    }
}
