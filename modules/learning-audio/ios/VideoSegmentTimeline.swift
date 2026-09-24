import Foundation

/// Positions count selected material only; excluded source gaps never enter checkpoints.
struct VideoSegmentTimeline: Sendable {
  struct Segment: Sendable { let start: Double; let end: Double }
  struct Location: Sendable { let member: Int; let mediaSeconds: Double }
  let segments: [Segment]
  let duration: Double

  init(segments: [Segment]) throws {
    guard (1...4).contains(segments.count) else { throw VideoError.invalid }
    var previousEnd = 0.0, total = 0.0
    for segment in segments {
      guard segment.start.isFinite, segment.end.isFinite,
        segment.start >= previousEnd, segment.end > segment.start else { throw VideoError.invalid }
      total += segment.end - segment.start
      previousEnd = segment.end
    }
    guard total.isFinite else { throw VideoError.invalid }
    self.segments = segments; duration = total
  }

  func locate(_ position: Double) throws -> Location {
    guard position.isFinite, position >= 0, position <= duration else { throw VideoError.invalid }
    var prefix = 0.0
    for (index, segment) in segments.enumerated() {
      let length = segment.end - segment.start
      if position < prefix + length || index == segments.count - 1 {
        return Location(member: index, mediaSeconds: min(segment.end, segment.start + position - prefix))
      }
      prefix += length
    }
    throw VideoError.invalid
  }

  func position(member: Int, mediaSeconds: Double) -> Double {
    let segment = segments[member]
    let prefix = segments.prefix(member).reduce(0) { $0 + ($1.end - $1.start) }
    return prefix + max(0, min(segment.end - segment.start, mediaSeconds.isFinite ? mediaSeconds - segment.start : 0))
  }
}
