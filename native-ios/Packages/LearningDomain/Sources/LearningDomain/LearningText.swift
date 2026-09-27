import Foundation

public enum LearningText {
    public static func firstWordHint(_ text: String) -> String {
        let normalized = text
            .replacingOccurrences(of: #"\b(Mr|Mrs|Ms|Dr|Prof|Sr|Jr)\.(?=\s+\p{L})"#, with: "$1", options: .regularExpression)
            .replacingOccurrences(of: #"\b([A-Z])\.(?=\s+[A-Z])"#, with: "$1", options: .regularExpression)
            .replacingOccurrences(of: #"(\d)\.(?=\d)"#, with: "$1", options: .regularExpression)
        return normalized.components(separatedBy: CharacterSet(charactersIn: ".!?。！？…")).compactMap { sentence in
            guard let range = sentence.range(of: #"[\p{L}\p{N}][\p{L}\p{N}\p{M}'’\-]*"#, options: .regularExpression) else { return nil }
            return "\(sentence[range]) …"
        }.joined(separator: " ")
    }
}
