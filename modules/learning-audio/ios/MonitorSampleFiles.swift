import Foundation

struct MonitorSampleFiles {
  let packages: URL
  func resolve(_ uri: String) throws -> URL {
    guard let url = URL(string: uri), url.isFileURL, (url.host ?? "").isEmpty,
          url.query == nil, url.fragment == nil else { throw LocalAudioError.invalidInput }
    let canonical = url.standardizedFileURL.resolvingSymlinksInPath()
    let prefix = packages.standardizedFileURL.resolvingSymlinksInPath().path + "/morning-notes-v1/audio/"
    let names = (1...12).map { String(format: "phrase-%02d.m4a", $0) }
    guard canonical.path.hasPrefix(prefix), names.contains(String(canonical.path.dropFirst(prefix.count))) else {
      throw LocalAudioError.invalidInput
    }
    let values = try canonical.resourceValues(forKeys: [.isRegularFileKey, .fileSizeKey])
    guard values.isRegularFile == true, (values.fileSize ?? 0) > 0 else { throw LocalAudioError.unavailableAudio }
    return canonical
  }
}
