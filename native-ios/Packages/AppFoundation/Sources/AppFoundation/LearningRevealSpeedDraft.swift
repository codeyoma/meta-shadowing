/// Editor rules for validated four-level preferences. Reading legacy values never saves them.
public enum LearningRevealSpeedDraft {
    public static func validWPM(_ text: String) -> Int? {
        guard !text.isEmpty, text.allSatisfy({ $0.isASCII && $0.isNumber }),
              let value = Int(text), (1...999).contains(value) else { return nil }
        return value
    }

    public static func normalized(_ saved: [Int]) -> [Int] {
        precondition(saved.count == 4 && saved.allSatisfy { (1...999).contains($0) })
        var result = saved
        result[0] = snap(saved[0], minimum: 100, maximum: 200, step: 25)
        for index in 1..<4 {
            result[index] = result[index - 1] + snap(saved[index] - saved[index - 1],
                                                   minimum: 50, maximum: 150, step: 50)
        }
        return result
    }

    /// The values one preset may take: S1 spans 100–200 in steps of 25; later
    /// levels sit 50–150 above the previous level in steps of 50.
    public static func editBounds(_ saved: [Int], index: Int) -> (range: ClosedRange<Int>, step: Int) {
        precondition((0..<4).contains(index))
        if index == 0 { return (100...200, 25) }
        let previous = normalized(saved)[index - 1]
        return (previous + 50...previous + 150, 50)
    }

    public static func changing(_ saved: [Int], index: Int, value: Int) -> [Int] {
        var result = normalized(saved)
        let bounds = editBounds(saved, index: index)
        let difference = snap(value, minimum: bounds.range.lowerBound, maximum: bounds.range.upperBound,
                              step: bounds.step) - result[index]
        for level in index..<4 { result[level] += difference }
        return result
    }

    private static func snap(_ value: Int, minimum: Int, maximum: Int, step: Int) -> Int {
        let clamped = min(maximum, max(minimum, value))
        return minimum + ((clamped - minimum + step / 2) / step) * step
    }
}
