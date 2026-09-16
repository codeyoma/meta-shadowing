import AVFoundation
import Foundation

enum LocalAudioError: Error { case invalidInput, unavailableAudio }

/// Read-only preflight of the original installed files. Never exports or changes audio.
struct LocalAudioInspection {
  let packages: URL

  func durations(_ uris: [String]) async throws -> [Double] {
    guard (1...4).contains(uris.count) else { throw LocalAudioError.invalidInput }
    var result: [Double] = []
    for uri in uris {
      let url = try sourceURL(uri)
      let asset = AVURLAsset(url: url)
      guard !(try await asset.loadTracks(withMediaType: .audio)).isEmpty else { throw LocalAudioError.unavailableAudio }
      let duration = try await asset.load(.duration).seconds
      guard duration.isFinite, duration > 0 else { throw LocalAudioError.unavailableAudio }
      // Also open the decoder: a valid container alone does not prove playable audio.
      let file = try AVAudioFile(forReading: url)
      guard file.length > 0 else { throw LocalAudioError.unavailableAudio }
      result.append(duration)
    }
    return result
  }

  private func sourceURL(_ uri: String) throws -> URL {
    guard let url = URL(string: uri), url.isFileURL, (url.host ?? "").isEmpty,
          url.query == nil, url.fragment == nil else { throw LocalAudioError.invalidInput }
    let canonical = url.standardizedFileURL.resolvingSymlinksInPath()
    let prefix = packages.standardizedFileURL.resolvingSymlinksInPath().path + "/"
    guard canonical.path.hasPrefix(prefix), canonical.pathExtension.lowercased() == "m4a" else { throw LocalAudioError.invalidInput }
    let relative = String(canonical.path.dropFirst(prefix.count)).split(separator: "/")
    guard relative.count == 3, relative[1] == "audio" else { throw LocalAudioError.invalidInput }
    let values = try canonical.resourceValues(forKeys: [.isRegularFileKey, .fileSizeKey])
    guard values.isRegularFile == true, (values.fileSize ?? 0) > 0 else { throw LocalAudioError.unavailableAudio }
    return canonical
  }
}
