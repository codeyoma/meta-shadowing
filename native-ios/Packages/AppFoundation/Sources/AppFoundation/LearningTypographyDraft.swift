public enum LearningTypographyDraft {
    public static func validSize(_ text: String) -> Int? {
        guard !text.isEmpty, text.allSatisfy({ $0.isASCII && $0.isNumber }),
              let value = Int(text), (12...48).contains(value) else { return nil }
        return value
    }
}
