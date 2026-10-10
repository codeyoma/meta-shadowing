import Foundation
import LearningDomain

public enum MediaSource: Equatable, Sendable {
    case audio(file: URL)
    case video(file: URL, start: Double, end: Double)

    public var file: URL {
        switch self { case let .audio(file), let .video(file, _, _): file }
    }
}

/// Installed asset references, not a source of purchase or installation authority.
public struct MediaAssetCatalog: Sendable {
    public let scope: LearningScope
    public let root: URL
    private let entries: [MediaSource]

    public init(scope: LearningScope, sourceCount: Int, root: URL, sources: [MediaSource]) throws {
        guard (1...100_000).contains(sourceCount), sources.count == sourceCount, root.isFileURL else {
            throw MediaFailure.invalidAsset
        }
        let canonicalRoot = root.standardizedFileURL.resolvingSymlinksInPath()
        let prefix = canonicalRoot.path.hasSuffix("/") ? canonicalRoot.path : canonicalRoot.path + "/"
        var videoFile: URL?
        var previousEnd = 0.0
        var previousStart = -Double.infinity
        let video: Bool
        if case .video = sources[0] { video = true } else { video = false }
        for source in sources {
            let file = source.file
            guard file.isFileURL, (file.host ?? "").isEmpty, file.query == nil, file.fragment == nil,
                  file.standardizedFileURL.resolvingSymlinksInPath().path.hasPrefix(prefix) else {
                throw MediaFailure.invalidAsset
            }
            switch source {
            case .audio:
                guard !video else { throw MediaFailure.invalidAsset }
            case let .video(file, start, end):
                guard video, start.isFinite, end.isFinite, start >= 0, start > previousStart,
                      end >= previousEnd, end > start,
                      videoFile == nil || videoFile == file else { throw MediaFailure.invalidAsset }
                videoFile = file; previousStart = start; previousEnd = end
            }
        }
        self.scope = scope; self.root = canonicalRoot; entries = sources
    }

    public func sources(for plan: LearningPlan, unit: Int) throws -> [MediaSource] {
        guard plan.scope == scope else { throw MediaFailure.accessDenied }
        guard plan.sourceCount == entries.count, plan.units.indices.contains(unit) else { throw MediaFailure.invalidAsset }
        // Recheck containment at use: a symlink may have changed since catalog creation.
        let selected = plan.units[unit].map { entries[$0] }
        _ = try Self(scope: scope, sourceCount: selected.count, root: root, sources: selected)
        return selected
    }
}
