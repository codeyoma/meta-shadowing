import Foundation
import Testing
@testable import AppleServices

struct ManifestTests {
    @Test func overlappingVideoPhrasesPreserveOriginalBounds() throws {
        let data = Data(#"{"kind":"video","schemaVersion":1,"id":"video-sample","version":1,"title":"Video","media":{"file":"video/source.mp4","bytes":3,"sha256":"aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa","duration":5},"phrases":[{"id":"one","start":1,"end":3,"text":"One","translation":"하나"},{"id":"two","start":2.8,"end":4,"text":"Two","translation":"둘"}]}"#.utf8)
        let descriptor = DeliveryPackage(key: "video-sample-v1", files: [
            .init(file: "manifest.json", bytes: data.count, sha256: String(repeating: "b", count: 64)),
            .init(file: "video/source.mp4", bytes: 3, sha256: String(repeating: "a", count: 64))])
        let parsed = try PackageManifest.decode(data, descriptor: descriptor)
        #expect(parsed.phrases.map(\.media) == [.video("video/source.mp4", start: 1, end: 3),
                                               .video("video/source.mp4", start: 2.8, end: 4)])
        for replacement in ["-1", "0.8", "1"] {
            let invalid = Data(String(decoding: data, as: UTF8.self)
                .replacingOccurrences(of: "\"start\":2.8", with: "\"start\":\(replacement)").utf8)
            #expect(throws: DeliveryError.invalidPackage) { try PackageManifest.decode(invalid, descriptor: descriptor) }
        }
    }

    @Test func videoRangesMustBeOrderedAndWithinPinnedMedia() throws {
        let data = Data(#"{"kind":"video","schemaVersion":1,"id":"video-sample","version":1,"title":"Video","media":{"file":"video/source.mp4","bytes":3,"sha256":"aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa","duration":2},"phrases":[{"id":"one","start":0,"end":1,"text":"Hello","translation":"안녕"}]}"#.utf8)
        let descriptor = DeliveryPackage(key: "video-sample-v1", files: [
            .init(file: "manifest.json", bytes: data.count, sha256: String(repeating: "b", count: 64)),
            .init(file: "video/source.mp4", bytes: 3, sha256: String(repeating: "a", count: 64))])
        let parsed = try PackageManifest.decode(data, descriptor: descriptor)
        #expect(parsed.phrases.first?.media == .video("video/source.mp4", start: 0, end: 1))
        let invalid = Data(String(decoding: data, as: UTF8.self).replacingOccurrences(of: "\"end\":1", with: "\"end\":3").utf8)
        #expect(throws: DeliveryError.invalidPackage) { try PackageManifest.decode(invalid, descriptor: descriptor) }
    }
    @Test func sourceMediaMustMatchThePinnedDescriptor() throws {
        let bytes = Data(#"{"id":"morning-notes","version":1,"title":"Sample","phrases":[{"text":"Hello","translation":"안녕","file":"audio/one.m4a","bytes":3,"sha256":"aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"}]}"#.utf8)
        let manifestEntry = DeliveryPackage.Entry(file: "manifest.json", bytes: bytes.count, sha256: String(repeating: "b", count: 64))
        let audioEntry = DeliveryPackage.Entry(file: "audio/one.m4a", bytes: 3, sha256: String(repeating: "a", count: 64))
        let descriptor = DeliveryPackage(key: "hosted-morning-notes-v1", files: [manifestEntry, audioEntry])
        let manifest = try PackageManifest.decode(bytes, descriptor: descriptor)
        #expect(manifest.bookID == "morning-notes")
        #expect(manifest.phrases.count == 1)
        #expect(manifest.phrases.first?.translation == "안녕")
        let changed = DeliveryPackage(key: descriptor.key, files: [manifestEntry, .init(file: audioEntry.file, bytes: 4, sha256: audioEntry.sha256)])
        #expect(throws: DeliveryError.invalidPackage) { try PackageManifest.decode(bytes, descriptor: changed) }
    }
}
