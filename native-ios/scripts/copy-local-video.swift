import Foundation

enum VideoCopyFailure: Error { case invalid }

func copyVideo(source: URL?, product: URL, configuration: String) throws {
    let fs = FileManager.default
    guard product.isFileURL, product.pathExtension == "app",
          try product.resourceValues(forKeys: [.isDirectoryKey, .isSymbolicLinkKey]).isDirectory == true,
          try product.resourceValues(forKeys: [.isSymbolicLinkKey]).isSymbolicLink != true else { throw VideoCopyFailure.invalid }
    let target = product.appendingPathComponent("LocalVideo", isDirectory: true)
    // This exact generated resource is never a source or a profile directory.
    if fs.fileExists(atPath: target.path) { try fs.removeItem(at: target) }
    guard configuration == "Debug", let source else { return }
    let paths = ["manifest.json", "video/source.mp4"] + (fs.fileExists(atPath: source.appendingPathComponent("syntax.json").path) ? ["syntax.json"] : [])
    for path in ["", "video"] + paths {
        let file = path.isEmpty ? source : source.appendingPathComponent(path)
        var current = file
        while current.path != "/" && current.path != "/var" {
            guard try current.resourceValues(forKeys: [.isSymbolicLinkKey]).isSymbolicLink != true else { throw VideoCopyFailure.invalid }
            current.deleteLastPathComponent()
        }
        let values = try file.resourceValues(forKeys: [.isRegularFileKey, .isDirectoryKey, .fileSizeKey])
        if paths.contains(path) {
            guard values.isRegularFile == true, let bytes = values.fileSize, bytes > 0,
                  bytes <= (path == "video/source.mp4" ? 4_000_000_000 : 20_000_000) else { throw VideoCopyFailure.invalid }
        } else if values.isDirectory != true { throw VideoCopyFailure.invalid }
    }
    do {
        try fs.createDirectory(at: target.appendingPathComponent("video"), withIntermediateDirectories: true)
        for path in paths { try fs.copyItem(at: source.appendingPathComponent(path), to: target.appendingPathComponent(path)) }
    } catch { try? fs.removeItem(at: target); throw error }
}

func testVideoCopy() throws {
    let fs = FileManager.default
    let root = fs.temporaryDirectory.appendingPathComponent(UUID().uuidString).resolvingSymlinksInPath()
    defer { try? fs.removeItem(at: root) }
    let source = root.appendingPathComponent("source"), product = root.appendingPathComponent("Fixture.app")
    try fs.createDirectory(at: source.appendingPathComponent("video"), withIntermediateDirectories: true)
    try fs.createDirectory(at: product, withIntermediateDirectories: true)
    for path in ["manifest.json", "video/source.mp4", "syntax.json"] { try Data("fixture".utf8).write(to: source.appendingPathComponent(path)) }
    let copied = product.appendingPathComponent("LocalVideo/syntax.json")
    try copyVideo(source: source, product: product, configuration: "Debug")
    guard fs.fileExists(atPath: copied.path) else { throw VideoCopyFailure.invalid }
    try copyVideo(source: source, product: product, configuration: "Release")
    guard !fs.fileExists(atPath: product.appendingPathComponent("LocalVideo").path) else { throw VideoCopyFailure.invalid }
    try copyVideo(source: nil, product: product, configuration: "Debug")
    guard !fs.fileExists(atPath: copied.path) else { throw VideoCopyFailure.invalid }
    try fs.removeItem(at: source.appendingPathComponent("syntax.json"))
    try fs.createSymbolicLink(at: source.appendingPathComponent("syntax.json"), withDestinationURL: source.appendingPathComponent("manifest.json"))
    do {
        try copyVideo(source: source, product: product, configuration: "Debug")
        throw NSError(domain: "ExpectedSymlinkRejection", code: 1)
    } catch VideoCopyFailure.invalid { }
    print("PASS: internal video copies only in Debug, includes analysis, rejects symlinks and leaves sources intact.")
}

do {
    if CommandLine.arguments.dropFirst() == ["--self-test"] { try testVideoCopy() }
    else {
        let values = ProcessInfo.processInfo.environment
        guard let directory = values["TARGET_BUILD_DIR"], let name = values["WRAPPER_NAME"],
              !name.contains("/"), let configuration = values["CONFIGURATION"] else { throw VideoCopyFailure.invalid }
        let source = values["NATIVE_LOCAL_VIDEO_SOURCE"].flatMap { $0.isEmpty ? nil : URL(fileURLWithPath: $0) }
        try copyVideo(source: source, product: URL(fileURLWithPath: directory).appendingPathComponent(name), configuration: configuration)
    }
} catch {
    FileHandle.standardError.write(Data("Internal video preparation failed.\n".utf8))
    exit(1)
}
