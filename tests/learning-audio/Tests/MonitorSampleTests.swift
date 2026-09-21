import Foundation
import Testing

struct MonitorSampleTests {
  @Test func onlyPublicInstalledSampleFilesAreAccepted() throws {
    let root = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
    let audio = root.appendingPathComponent("morning-notes-v1/audio")
    try FileManager.default.createDirectory(at: audio, withIntermediateDirectories: true)
    defer { try? FileManager.default.removeItem(at: root) }
    let file = audio.appendingPathComponent("phrase-01.m4a")
    try Data([1]).write(to: file)
    let resolver = MonitorSampleFiles(packages: root)
    #expect(try resolver.resolve(file.absoluteString) == file.resolvingSymlinksInPath())
    for uri in ["https://example.com/a.m4a", root.appendingPathComponent("duo/audio/phrase-01.m4a").absoluteString,
                file.absoluteString + "?token=x", audio.appendingPathComponent("../phrase-01.m4a").absoluteString,
                audio.appendingPathComponent("phrase-99.m4a").absoluteString] {
      #expect(throws: (any Error).self) { try resolver.resolve(uri) }
    }
    let outside = root.appendingPathComponent("outside.m4a")
    try Data([1]).write(to: outside)
    let link = audio.appendingPathComponent("phrase-02.m4a")
    try FileManager.default.createSymbolicLink(at: link, withDestinationURL: outside)
    #expect(throws: (any Error).self) { try resolver.resolve(link.absoluteString) }
  }
}

#if os(iOS)
import AVFoundation
struct MonitorEngineTests {
  @Test @MainActor func releaseAndUnsupportedRouteCannotStartOrPlay() async throws {
    let engine = VoiceMonitorEngine(allowed: false)
    let controller = VoiceMonitorController(hardware: engine, allowed: false)
    await controller.enable()
    #expect(controller.state == .blocked)
    #expect(!engine.running)
    #expect(throws: (any Error).self) { try engine.start(gain: 1) }
    #expect(throws: (any Error).self) { try engine.playSample("file:///not-allowed.m4a") }
    engine.shutdown()
    engine.shutdown()
    #expect(!engine.running)
  }
}
#endif
