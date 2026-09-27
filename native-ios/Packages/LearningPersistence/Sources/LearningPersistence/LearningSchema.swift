import Foundation
import LearningDomain

enum LearningSchema {
    static func prepare(_ db: SQLiteConnection, profileID: String) throws {
        let version = try db.query("PRAGMA user_version").first?["user_version"]?.integer ?? -1
        guard version <= 1 else { throw LearningStoreError.unsupportedSchema }
        guard version >= 0 else { throw LearningStoreError.corrupt }
        // Check the version before changing any persistent PRAGMA or schema.
        try db.execute("PRAGMA journal_mode=WAL")
        try db.execute("PRAGMA synchronous=FULL")
        try db.execute("PRAGMA foreign_keys=ON")
        if version == 0 {
            let tables = try db.query("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'")
            guard tables.isEmpty else { throw LearningStoreError.corrupt }
            try db.transaction {
                try db.script("""
                    CREATE TABLE metadata(id INTEGER PRIMARY KEY CHECK(id=1), profile TEXT NOT NULL,
                      revision INTEGER NOT NULL CHECK(revision>=0), acknowledged INTEGER NOT NULL CHECK(acknowledged>=0 AND acknowledged<=revision),
                      writer TEXT NOT NULL, clock TEXT NOT NULL, generation TEXT);
                    CREATE TABLE checkpoints(package TEXT NOT NULL, stage INTEGER NOT NULL CHECK(stage BETWEEN 1 AND 16),
                      run TEXT NOT NULL, state BLOB, clock TEXT NOT NULL, wire TEXT, PRIMARY KEY(package,stage), CHECK(state IS NOT NULL OR wire IS NOT NULL));
                    CREATE TABLE reward_runs(package TEXT NOT NULL, stage INTEGER NOT NULL CHECK(stage BETWEEN 1 AND 16),
                      run TEXT NOT NULL, state BLOB NOT NULL, credited INTEGER NOT NULL CHECK(credited BETWEEN 0 AND 2147483647), PRIMARY KEY(package,stage,run));
                    CREATE TABLE completions(package TEXT NOT NULL, stage INTEGER NOT NULL CHECK(stage BETWEEN 1 AND 16),
                      run TEXT NOT NULL, state BLOB NOT NULL, PRIMARY KEY(package,stage,run));
                    CREATE TABLE study_days(language TEXT NOT NULL, day TEXT NOT NULL, state BLOB NOT NULL, PRIMARY KEY(language,day));
                    CREATE TABLE preferences(id INTEGER PRIMARY KEY CHECK(id=1), state BLOB NOT NULL, clock TEXT NOT NULL, selection_clock TEXT NOT NULL);
                    CREATE TABLE historical_awards(language TEXT NOT NULL, book TEXT NOT NULL, run TEXT NOT NULL, state BLOB NOT NULL, PRIMARY KEY(language,book,run));
                    CREATE TABLE backup_imports(id INTEGER PRIMARY KEY CHECK(id=1), state BLOB NOT NULL);
                    CREATE TABLE commands(id TEXT PRIMARY KEY, writer TEXT NOT NULL, payload BLOB NOT NULL, receipt BLOB NOT NULL);
                    PRAGMA user_version=1;
                    """)
                try db.execute("INSERT INTO metadata VALUES(1,?,0,0,?,'',NULL)", [.text(profileID), .text(UUID().uuidString.lowercased().replacingOccurrences(of: "-", with: ""))])
                try db.execute("INSERT INTO preferences VALUES(1,?,'','')", [.blob(try encode(ProfilePreferences()))])
            }
        }
        guard try db.query("SELECT profile FROM metadata WHERE id=1").first?["profile"]?.text == profileID else { throw LearningStoreError.corrupt }
        guard try db.query("PRAGMA quick_check").first?["quick_check"]?.text == "ok" else { throw LearningStoreError.corrupt }
    }
}
func encode<T: Encodable>(_ value: T) throws -> Data {
    let encoder = JSONEncoder(); encoder.outputFormatting = [.sortedKeys, .withoutEscapingSlashes]
    return try encoder.encode(value)
}
func decode<T: Decodable>(_ type: T.Type, _ value: SQLValue?) throws -> T {
    guard let data = value?.data else { throw LearningStoreError.corrupt }
    do { return try JSONDecoder().decode(type, from: data) } catch { throw LearningStoreError.corrupt }
}
