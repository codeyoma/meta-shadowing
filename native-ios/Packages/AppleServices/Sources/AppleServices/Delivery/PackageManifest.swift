import Foundation

public struct PackageManifest: Sendable {
    public struct Phrase: Sendable {
        public let text: String
        public let translation: String
        public let media: Media
    }
    public enum Media: Equatable, Sendable {
        case audio(String)
        case video(String, start: Double, end: Double)
    }
    public let bookID: String
    public let learningBookID: String
    public let title: String
    public let language: String
    public let phrases: [Phrase]

    public static func decode(_ data: Data, descriptor: DeliveryPackage) throws -> Self {
        guard !data.isEmpty, data.count <= 20_000_000 else { throw DeliveryError.invalidPackage }
        let raw: WireManifest
        do { raw = try JSONDecoder().decode(WireManifest.self, from: data) }
        catch { throw DeliveryError.invalidPackage }
        guard raw.version > 0,
              raw.id.range(of: "^[a-z0-9]+(?:-[a-z0-9]+)*$", options: .regularExpression) != nil,
              ["\(raw.id)-v\(raw.version)", "hosted-\(raw.id)-v\(raw.version)"].contains(descriptor.key),
              !raw.title.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty,
              !raw.phrases.isEmpty, raw.phrases.count <= 1000,
              Set(descriptor.files.map(\.file)).count == descriptor.files.count else { throw DeliveryError.invalidPackage }
        let language = (raw.language ?? "english").lowercased()
        guard ["english", "japanese", "chinese", "german", "spanish", "french"].contains(language) else { throw DeliveryError.invalidPackage }
        let files = Dictionary(uniqueKeysWithValues: descriptor.files.map { ($0.file, $0) })
        var paths = Set<String>()
        var phrases: [Phrase] = []
        var previousEnd = 0.0
        var previousStart = -Double.infinity
        if let kind = raw.kind {
            guard kind == "video", raw.schemaVersion == 1, raw.id.hasPrefix("video-"),
                  raw.id.count <= 80, let media = raw.media, media.file == "video/source.mp4",
                  media.duration.isFinite, media.duration > 0,
                  media.bytes > 0, media.bytes <= 4_000_000_000,
                  files[media.file] == DeliveryPackage.Entry(file: media.file, bytes: media.bytes, sha256: media.sha256)
            else { throw DeliveryError.invalidPackage }
        }
        for phrase in raw.phrases {
            guard !phrase.text.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty,
                  !phrase.translation.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty else { throw DeliveryError.invalidPackage }
            if raw.kind == "video", let media = raw.media {
                guard let id = phrase.id, !id.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty,
                      id.count <= 10_000, phrase.text.count <= 10_000, phrase.translation.count <= 10_000,
                      paths.insert(id).inserted, let start = phrase.start, let end = phrase.end,
                      start.isFinite, end.isFinite, start >= 0, start > previousStart,
                      end >= previousEnd, end > start, end <= media.duration
                else { throw DeliveryError.invalidPackage }
                phrases.append(Phrase(text: phrase.text, translation: phrase.translation, media: .video(media.file, start: start, end: end)))
                previousStart = start; previousEnd = end
                continue
            }
            guard let file = phrase.file, let bytes = phrase.bytes, let sha256 = phrase.sha256,
                  file.range(of: "^audio/[a-z0-9-]+\\.m4a$", options: .regularExpression) != nil,
                  paths.insert(file).inserted,
                  files[file] == DeliveryPackage.Entry(file: file, bytes: bytes, sha256: sha256) else { throw DeliveryError.invalidPackage }
            phrases.append(Phrase(text: phrase.text, translation: phrase.translation, media: .audio(file)))
        }
        if raw.kind == nil {
            guard Set(files.keys.filter { $0.hasPrefix("audio/") }) == paths else { throw DeliveryError.invalidPackage }
        }
        if descriptor.key == LibraryMaterial.paidDuo {
            guard raw.phrases.count == 560, let metadata = raw.metadata,
                  Set(metadata.map(\.file)) == ["cover.jpg", "info.json", "text.txt", "syntax.json"], metadata.count == 4,
                  metadata.allSatisfy({ files[$0.file] == $0 }),
                  raw.phrases.enumerated().allSatisfy({ index, phrase in
                      phrase.file == String(format: "audio/phrase-%03d.m4a", index + 1) && (1...45).contains(phrase.section ?? 0)
                  }) else { throw DeliveryError.invalidPackage }
        }
        return Self(bookID: raw.id, learningBookID: descriptor.key.hasPrefix("hosted-") ? "hosted-" + raw.id : raw.id,
                    title: raw.title, language: language, phrases: phrases)
    }

    static func read(root: URL, descriptor: DeliveryPackage) throws -> Self {
        let file = root.appendingPathComponent("manifest.json")
        let attributes = try FileManager.default.attributesOfItem(atPath: file.path)
        guard attributes[.type] as? FileAttributeType == .typeRegular,
              let size = (attributes[.size] as? NSNumber)?.intValue,
              (1...20_000_000).contains(size) else { throw DeliveryError.invalidPackage }
        let handle = try FileHandle(forReadingFrom: file)
        defer { try? handle.close() }
        return try decode(handle.read(upToCount: 20_000_001) ?? Data(), descriptor: descriptor)
    }
}

private struct WireManifest: Decodable {
    struct Phrase: Decodable {
        let text: String, translation: String
        let file: String?
        let bytes: Int?
        let sha256: String?
        let section: Int?
        let id: String?
        let start: Double?
        let end: Double?
    }
    struct Media: Decodable { let file: String; let bytes: Int; let sha256: String; let duration: Double }
    let id: String, title: String
    let version: Int
    let language: String?
    let kind: String?
    let schemaVersion: Int?
    let media: Media?
    let phrases: [Phrase]
    let metadata: [DeliveryPackage.Entry]?
}
