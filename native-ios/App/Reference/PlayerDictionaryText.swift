import SwiftUI
import AppFoundation
import LearningDomain

/// Links only whole, currently permitted words. It never receives hidden source text for eligibility.
enum PlayerDictionaryWords {
    static func visibleText(line: LearningTextLine, session: LearningSession) -> String? {
        if session.isSilent && ![.speaking, .decision, .complete].contains(session.phase) { return nil }
        let text = line.accessibleText
        return text.isEmpty ? nil : text
    }
    static func terms(_ text: String) -> [String] {
        let source = text as NSString
        return DictionaryWords.ranges(text).map { source.substring(with: $0) }
    }
    static func attributed(_ text: String) -> AttributedString {
        var result = AttributedString(text)
        for range in DictionaryWords.ranges(text) {
            guard let stringRange = Range(range, in: text), let attributedRange = Range(stringRange, in: result) else { continue }
            result[attributedRange].link = URL(string: "learning-word://lookup/\(range.location)")
            result[attributedRange].foregroundColor = .primary
            result[attributedRange].underlineStyle = .none
        }
        return result
    }
    static func term(_ url: URL, in text: String) -> String? {
        guard url.scheme == "learning-word", url.host == "lookup", let offset = Int(url.lastPathComponent),
              let range = DictionaryWords.ranges(text).first(where: { $0.location == offset }) else { return nil }
        return (text as NSString).substring(with: range)
    }
}

struct PlayerDictionaryText: View {
    let text: String
    let lookup: (String) -> Void
    var body: some View {
        Text(PlayerDictionaryWords.attributed(text))
            .environment(\.openURL, OpenURLAction { url in
                if let term = PlayerDictionaryWords.term(url, in: text) { lookup(term) }
                return .handled
            })
    }
}
