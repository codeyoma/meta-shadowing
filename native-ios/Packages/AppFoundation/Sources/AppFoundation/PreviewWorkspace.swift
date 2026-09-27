import Foundation
import LearningDomain

public actor PreviewWorkspace {
    private let directory: URL

    public init(root: URL) {
        directory = root.appending(path: "SwiftNativeFoundation/v1", directoryHint: .isDirectory)
    }

    public func loadLibrary() async throws -> PreviewLibrary {
        try Task.checkCancellation()
        try FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)
        let file = directory.appending(path: "library.json")
        let data: Data
        do {
            data = try Data(contentsOf: file)
        } catch CocoaError.fileReadNoSuchFile {
            data = Data(Self.sample.utf8)
            try Task.checkCancellation()
            try data.write(to: file, options: .atomic)
        }
        try Task.checkCancellation()
        return try PreviewLibrary.decode(data)
    }

    private static let sample = #"""
    {"schemaVersion":1,"lessons":[{"id":"native-sample","title":"네이티브 샘플","sentences":[
      {"id":"hello","source":"Hello, world.","translation":"안녕하세요."},
      {"id":"ready","source":"I am ready to learn.","translation":"배울 준비가 되었어요."},
      {"id":"step","source":"One step at a time.","translation":"한 번에 한 걸음씩."}
    ]}]}
    """#
}
