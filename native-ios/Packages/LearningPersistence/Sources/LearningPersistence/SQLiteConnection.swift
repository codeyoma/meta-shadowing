import Foundation
import SQLite3
import LearningDomain

enum SQLValue: Codable, Equatable, Sendable {
    case text(String), integer(Int64), blob(Data), null
    var text: String? { if case let .text(value) = self { value } else { nil } }
    var integer: Int64? { if case let .integer(value) = self { value } else { nil } }
    var data: Data? { if case let .blob(value) = self { value } else { nil } }
}

/// Non-Sendable: every connection and statement remains inside the owning store actor.
final class SQLiteConnection {
    private var handle: OpaquePointer?
    init(path: String, readOnly: Bool = false) throws {
        let flags = readOnly ? SQLITE_OPEN_READONLY : SQLITE_OPEN_READWRITE | SQLITE_OPEN_CREATE
        let result = sqlite3_open_v2(path, &handle, flags | SQLITE_OPEN_FULLMUTEX, nil)
        guard result == SQLITE_OK else {
            if let handle { sqlite3_close_v2(handle) }; handle = nil
            throw LearningStoreError.sqlite(result)
        }
        sqlite3_extended_result_codes(handle, 1)
        let timeoutResult = sqlite3_busy_timeout(handle, 250)
        guard timeoutResult == SQLITE_OK else {
            if let handle { sqlite3_close_v2(handle) }; handle = nil
            throw LearningStoreError.sqlite(timeoutResult)
        }
    }
    deinit { if let handle { sqlite3_close_v2(handle) } }
    func close() throws {
        guard let handle else { return }
        let result = sqlite3_close(handle)
        guard result == SQLITE_OK else { throw LearningStoreError.sqlite(result) }
        self.handle = nil
    }
    func execute(_ sql: String, _ bindings: [SQLValue] = []) throws { _ = try query(sql, bindings) }
    func script(_ sql: String) throws {
        guard let handle else { throw LearningStoreError.sqlite(SQLITE_MISUSE) }
        let result = sqlite3_exec(handle, sql, nil, nil, nil)
        guard result == SQLITE_OK else { throw LearningStoreError.sqlite(result) }
    }
    func query(_ sql: String, _ bindings: [SQLValue] = []) throws -> [[String: SQLValue]] {
        guard let handle else { throw LearningStoreError.sqlite(SQLITE_MISUSE) }
        var statement: OpaquePointer?
        let prepared = sqlite3_prepare_v2(handle, sql, -1, &statement, nil)
        guard prepared == SQLITE_OK, let statement else { throw LearningStoreError.sqlite(prepared) }
        var finalized = false
        defer { if !finalized { sqlite3_finalize(statement) } }
        guard sqlite3_bind_parameter_count(statement) == bindings.count else { throw LearningStoreError.corrupt }
        let transient = unsafeBitCast(-1, to: sqlite3_destructor_type.self)
        for (offset, value) in bindings.enumerated() {
            let index = Int32(offset + 1)
            let result: Int32
            switch value {
            case let .integer(value): result = sqlite3_bind_int64(statement, index, value)
            case let .text(value):
                result = value.withCString { sqlite3_bind_text(statement, index, $0, Int32(value.utf8.count), transient) }
            case let .blob(value):
                result = value.withUnsafeBytes { bytes in
                    if bytes.isEmpty { sqlite3_bind_zeroblob(statement, index, 0) }
                    else { sqlite3_bind_blob(statement, index, bytes.baseAddress, Int32(bytes.count), transient) }
                }
            case .null: result = sqlite3_bind_null(statement, index)
            }
            guard result == SQLITE_OK else { throw LearningStoreError.sqlite(result) }
        }
        var rows: [[String: SQLValue]] = []
        while true {
            let result = sqlite3_step(statement)
            if result == SQLITE_DONE { break }
            guard result == SQLITE_ROW else { throw LearningStoreError.sqlite(result) }
            var row: [String: SQLValue] = [:]
            for index in 0..<sqlite3_column_count(statement) {
                let name = String(cString: sqlite3_column_name(statement, index))
                switch sqlite3_column_type(statement, index) {
                case SQLITE_INTEGER: row[name] = .integer(sqlite3_column_int64(statement, index))
                case SQLITE_TEXT:
                    guard let bytes = sqlite3_column_text(statement, index) else { throw LearningStoreError.corrupt }
                    let count = Int(sqlite3_column_bytes(statement, index))
                    guard let value = String(bytes: UnsafeBufferPointer(start: bytes, count: count), encoding: .utf8) else { throw LearningStoreError.corrupt }
                    row[name] = .text(value)
                case SQLITE_BLOB:
                    let count = Int(sqlite3_column_bytes(statement, index))
                    if count == 0 { row[name] = .blob(Data()) }
                    else if let bytes = sqlite3_column_blob(statement, index) { row[name] = .blob(Data(bytes: bytes, count: count)) }
                    else { throw LearningStoreError.corrupt }
                case SQLITE_NULL: row[name] = .null
                default: throw LearningStoreError.corrupt
                }
            }
            rows.append(row)
        }
        let result = sqlite3_finalize(statement); finalized = true
        guard result == SQLITE_OK else { throw LearningStoreError.sqlite(result) }
        return rows
    }
    func transaction<T>(_ body: () throws -> T) throws -> T {
        try execute("BEGIN IMMEDIATE")
        do {
            let result = try body()
            try execute("COMMIT")
            return result
        } catch { try? execute("ROLLBACK"); throw error }
    }
}
