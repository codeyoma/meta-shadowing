import Foundation

/// A playback projection only: source bounds remain unchanged in the catalog.
/// Shared time belongs to the later caption; disconnected source gaps stay excluded.
struct VideoMediaTimeline {
    struct Segment { let start: Double; let end: Double }
    let segments: [Segment]
    let selected: SelectedMediaTimeline

    init(sources: [MediaSource]) throws {
        guard (1...4).contains(sources.count), let file = sources.first?.file else { throw MediaFailure.invalidAsset }
        var original: [Segment] = []
        var previousStart = -Double.infinity, previousEnd = 0.0
        for source in sources {
            guard case let .video(url, start, end) = source, url == file,
                  start.isFinite, end.isFinite, start >= 0, start > previousStart,
                  end > start, end >= previousEnd else { throw MediaFailure.invalidAsset }
            original.append(.init(start: start, end: end))
            previousStart = start; previousEnd = end
        }
        segments = original.enumerated().map { index, segment in
            let end = index + 1 < original.count ? min(segment.end, original[index + 1].start) : segment.end
            return Segment(start: segment.start, end: end)
        }
        selected = try SelectedMediaTimeline(durations: segments.map { $0.end - $0.start })
    }
}
