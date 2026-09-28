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

    public static func changing(_ saved: [Int], index: Int, value: Int) -> [Int] {
        precondition((0..<4).contains(index))
        var result = normalized(saved)
        let minimum = index == 0 ? 100 : result[index - 1] + 50
        let maximum = index == 0 ? 200 : result[index - 1] + 150
        let difference = snap(value, minimum: minimum, maximum: maximum, step: index == 0 ? 25 : 50) - result[index]
        for level in index..<4 { result[level] += difference }
        return result
    }

    private static func snap(_ value: Int, minimum: Int, maximum: Int, step: Int) -> Int {
        let clamped = min(maximum, max(minimum, value))
        return minimum + ((clamped - minimum + step / 2) / step) * step
    }
}
