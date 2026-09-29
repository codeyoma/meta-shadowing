import Foundation
import NaturalLanguage

enum DictionaryWords {
  /// UTF-16 ranges match JavaScript string offsets. Never normalize the displayed term.
  static func ranges(_ text: String) -> [NSRange] {
    let tokenizer = NLTokenizer(unit: .word)
    tokenizer.string = text
    let source = text as NSString
    let word = try! NSRegularExpression(pattern: #"[\p{L}\p{N}][\p{L}\p{N}\p{M}]*(?:['’\-‐‑][\p{L}\p{N}][\p{L}\p{N}\p{M}]*)*"#)
    var result: [NSRange] = []
    tokenizer.enumerateTokens(in: text.startIndex..<text.endIndex) { range, _ in
      for match in word.matches(in: text, range: NSRange(range, in: text)) {
        let next = match.range
        if let previous = result.last {
          let gap = NSRange(location: NSMaxRange(previous), length: next.location - NSMaxRange(previous))
          if gap.length == 1, ["'", "’", "-", "‐", "‑"].contains(source.substring(with: gap)) {
            result[result.count - 1] = NSRange(location: previous.location, length: NSMaxRange(next) - previous.location)
            continue
          }
        }
        result.append(next)
      }
      return true
    }
    return result
  }
}
