import Foundation

/// Shared allocation allowance for both inferred legacy rows and explicit/compact arrays.
struct BackupExpansionBudget {
    private(set) var remaining = 1_000_000
    mutating func reserve(_ cells: Int) throws {
        guard cells >= 0, cells <= remaining else { throw LearningError.invalidState }
        remaining -= cells
    }
}

enum BackupJSON: Codable, Equatable, Sendable {
    case object([String: Self]), array([Self]), string(String), number(Double), bool(Bool), null
    init(from decoder: any Decoder) throws {
        let c = try decoder.singleValueContainer()
        if c.decodeNil() { self = .null }
        else if let value = try? c.decode(Bool.self) { self = .bool(value) }
        else if let value = try? c.decode(Double.self) { self = .number(value) }
        else if let value = try? c.decode(String.self) { self = .string(value) }
        else if let value = try? c.decode([Self].self) { self = .array(value) }
        else { self = .object(try c.decode([String: Self].self)) }
    }
    func encode(to encoder: any Encoder) throws {
        var c = encoder.singleValueContainer()
        switch self {
        case let .object(v): try c.encode(v)
        case let .array(v): try c.encode(v)
        case let .string(v): try c.encode(v)
        case let .number(v): try c.encode(v)
        case let .bool(v): try c.encode(v)
        case .null: try c.encodeNil()
        }
    }
    var string: String { get throws { guard case let .string(v) = self else { throw LearningError.invalidState }; return v } }
    var array: [Self] { get throws { guard case let .array(v) = self, v.count <= 100_000 else { throw LearningError.invalidState }; return v } }
    var object: [String: Self] { get throws { guard case let .object(v) = self else { throw LearningError.invalidState }; return v } }
    func object(keys: Set<String>, optional: Set<String> = []) throws -> [String: Self] {
        let result = try object, actual = Set(result.keys)
        guard keys.isSubset(of: actual), actual.isSubset(of: keys.union(optional)) else { throw LearningError.invalidState }
        return result
    }
    func integer(_ minimum: Int64 = 0, _ maximum: Int64 = 9_007_199_254_740_991) throws -> Int64 {
        guard case let .number(v) = self, v.isFinite, v.rounded(.towardZero) == v,
              v >= Double(minimum), v <= Double(maximum) else { throw LearningError.invalidState }
        return Int64(v)
    }
    func identity(limit: Int = 200) throws -> String {
        let value = try string
        guard validIdentity(value, limit: limit) else { throw LearningError.invalidIdentity }
        return value
    }
    static func parse(_ data: Data, limit: Int = 16 * 1024 * 1024) throws -> Self {
        guard data.count <= limit, String(data: data, encoding: .utf8) != nil else { throw LearningError.invalidState }
        var scanner = JSONKeyScanner(bytes: Array(data)); try scanner.validate()
        do { return try JSONDecoder().decode(Self.self, from: data) } catch { throw LearningError.invalidState }
    }
    static func parse(_ string: String, limit: Int = 4 * 1024 * 1024) throws -> Self { try parse(Data(string.utf8), limit: limit) }
    func data() throws -> Data {
        let encoder = JSONEncoder(); encoder.outputFormatting = [.sortedKeys, .withoutEscapingSlashes]
        return try encoder.encode(self)
    }
    func json() throws -> String { String(decoding: try data(), as: UTF8.self) }
    static func integer(_ value: Int) -> Self { .number(Double(value)) }
    static func encoded<T: Encodable>(_ value: T) throws -> Self { try parse(JSONEncoder().encode(value)) }
}

/// JSONDecoder accepts duplicate object keys. Reject them before decoding any wire model.
private struct JSONKeyScanner {
    let bytes: [UInt8]
    var index = 0
    mutating func whitespace() { while index < bytes.count && [9, 10, 13, 32].contains(bytes[index]) { index += 1 } }
    mutating func take(_ byte: UInt8) throws { whitespace(); guard index < bytes.count, bytes[index] == byte else { throw LearningError.invalidState }; index += 1 }
    mutating func string() throws -> String {
        whitespace(); let start = index; try take(34)
        while index < bytes.count {
            if bytes[index] == 92 { index += 2; continue }
            if bytes[index] == 34 {
                index += 1
                guard let value = try? JSONDecoder().decode(String.self, from: Data(bytes[start..<index])) else { throw LearningError.invalidState }
                return value
            }
            index += 1
        }
        throw LearningError.invalidState
    }
    mutating func value(depth: Int) throws {
        guard depth <= 64 else { throw LearningError.invalidState }
        whitespace(); guard index < bytes.count else { throw LearningError.invalidState }
        switch bytes[index] {
        case 34: _ = try string()
        case 123:
            index += 1; whitespace(); var keys: Set<String> = []
            if index < bytes.count && bytes[index] == 125 { index += 1; return }
            while true {
                guard keys.count < 100_000, keys.insert(try string()).inserted else { throw LearningError.invalidState }
                try take(58); try value(depth: depth + 1); whitespace()
                guard index < bytes.count else { throw LearningError.invalidState }
                if bytes[index] == 125 { index += 1; break }
                try take(44)
            }
        case 91:
            index += 1; whitespace(); var count = 0
            if index < bytes.count && bytes[index] == 93 { index += 1; return }
            while true {
                count += 1; guard count <= 100_000 else { throw LearningError.invalidState }
                try value(depth: depth + 1); whitespace()
                guard index < bytes.count else { throw LearningError.invalidState }
                if bytes[index] == 93 { index += 1; break }
                try take(44)
            }
        default:
            let start = index
            while index < bytes.count && ![9, 10, 13, 32, 44, 93, 125].contains(bytes[index]) { index += 1 }
            guard index > start else { throw LearningError.invalidState }
        }
    }
    mutating func validate() throws { try value(depth: 0); whitespace(); guard index == bytes.count else { throw LearningError.invalidState } }
}

enum BackupCounts {
    static func decode(_ value: BackupJSON, remaining: Int) throws -> [Int] {
        if case let .string(value) = value {
            guard !value.isEmpty, value.utf8.count <= 1_500_000 else { throw LearningError.invalidState }
            var groups: [(Int, Int)] = [], length = 0
            for group in value.split(separator: ",", omittingEmptySubsequences: false) {
                let pair = group.split(separator: "*", omittingEmptySubsequences: false)
                guard pair.count == 2, pair.allSatisfy({ !$0.isEmpty && $0.allSatisfy({ $0.isASCII && $0.isNumber }) }),
                      pair[0].first != "0", let count = Int(pair[0]), let number = Int(pair[1]),
                      (1...100_000).contains(count), (0...100_000).contains(number),
                      length <= min(100_000, remaining) - count else { throw LearningError.invalidState }
                groups.append((count, number)); length += count
            }
            return groups.flatMap { Array(repeating: $0.1, count: $0.0) }
        }
        let values = try value.array
        guard !values.isEmpty, values.count <= remaining else { throw LearningError.invalidState }
        return try values.map { Int(try $0.integer(0, 100_000)) }
    }
    static func encode(_ counts: [Int]) -> BackupJSON {
        var groups: [String] = [], index = 0
        while index < counts.count {
            var end = index + 1
            while end < counts.count && counts[end] == counts[index] { end += 1 }
            groups.append("\(end - index)*\(counts[index])"); index = end
        }
        let compact = groups.joined(separator: ",")
        let array = BackupJSON.array(counts.map(BackupJSON.integer))
        return compact.utf8.count + 2 < ((try? array.data().count) ?? 0) ? .string(compact) : array
    }
}

extension Dictionary where Key == String, Value == BackupJSON {
    func required(_ key: String) throws -> BackupJSON { guard let value = self[key] else { throw LearningError.invalidState }; return value }
    func text(_ key: String) throws -> String { try required(key).string }
    func int(_ key: String, _ minimum: Int64 = 0, _ maximum: Int64 = 9_007_199_254_740_991) throws -> Int {
        Int(try required(key).integer(minimum, maximum))
    }
}
