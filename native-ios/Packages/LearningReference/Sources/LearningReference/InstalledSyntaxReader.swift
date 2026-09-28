import Foundation
import CryptoKit

/// Supplied by an authorized catalog from its immutable installation descriptor.
public struct InstalledSyntaxFile: Sendable {
    public let root: URL
    public let relativePath: String
    public let byteCount: Int
    public let sha256: String
    public init(root: URL, relativePath: String, byteCount: Int, sha256: String) {
        self.root = root; self.relativePath = relativePath; self.byteCount = byteCount; self.sha256 = sha256
    }
}
public actor InstalledSyntaxReader {
    public init() {}
    public func read(_ file: InstalledSyntaxFile) throws -> Data {
        try Task.checkCancellation()
        guard file.root.isFileURL, (1...20_000_000).contains(file.byteCount),
              file.sha256.count == 64, file.sha256.allSatisfy({ $0.isASCII && $0.isHexDigit }),
              !file.relativePath.isEmpty, !file.relativePath.hasPrefix("/"), !file.relativePath.contains("\\"),
              !file.relativePath.split(separator: "/").contains(where: { $0 == ".." || $0 == "." })
        else { throw AnalysisError.invalid }
        let root = file.root.standardizedFileURL.resolvingSymlinksInPath()
        let url = root.appending(path: file.relativePath).standardizedFileURL.resolvingSymlinksInPath()
        guard url.path.hasPrefix(root.path + "/") else { throw AnalysisError.invalid }
        let attributes = try url.resourceValues(forKeys: [.isRegularFileKey, .fileSizeKey])
        guard attributes.isRegularFile == true, attributes.fileSize == file.byteCount else { throw AnalysisError.invalid }
        let handle = try FileHandle(forReadingFrom: url)
        defer { try? handle.close() }
        let data = try handle.read(upToCount: file.byteCount + 1) ?? Data()
        try Task.checkCancellation()
        guard data.count == file.byteCount,
              SHA256.hash(data: data).map({ String(format: "%02x", $0) }).joined() == file.sha256.lowercased(),
              String(data: data, encoding: .utf8) != nil else { throw AnalysisError.invalid }
        return data
    }
}
