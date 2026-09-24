import Testing

struct VideoSegmentTimelineTests {
  @Test func everySavedMemberEndResumesTheNextIncludedMember() throws {
    let segments: [VideoSegmentTimeline.Segment] = [.init(start: 0.2, end: 0.6), .init(start: 0.6, end: 1),
      .init(start: 5, end: 5.6), .init(start: 7, end: 7.8)]
    let timeline = try VideoSegmentTimeline(segments: segments)
    for member in 0..<3 {
      let checkpoint = timeline.position(member: member, mediaSeconds: segments[member].end)
      let restored = try timeline.locate(checkpoint)
      #expect(restored.member == member + 1)
      #expect(abs(restored.mediaSeconds - segments[member + 1].start) < 0.000001)
    }
    #expect(timeline.position(member: 3, mediaSeconds: segments[3].end) == timeline.duration)
  }
  @Test func rejectsInvalidSegmentsAndOffsets() throws {
    let invalid: [[VideoSegmentTimeline.Segment]] = [[],
      (0..<5).map { .init(start: Double($0), end: Double($0) + 0.5) },
      [.init(start: 1, end: 0)], [.init(start: 0, end: 0)],
      [.init(start: -1, end: 1)], [.init(start: 0, end: .infinity)],
      [.init(start: .nan, end: 1)],
      [.init(start: 1, end: 2), .init(start: 0, end: 1)],
      [.init(start: 0, end: 2), .init(start: 1, end: 3)]]
    for segments in invalid {
      #expect(throws: (any Error).self) { try VideoSegmentTimeline(segments: segments) }
    }
    let single = try VideoSegmentTimeline(segments: [.init(start: 2, end: 3)])
    #expect(try single.locate(0).mediaSeconds == 2)
    #expect(try single.locate(1).mediaSeconds == 3)
    #expect(single.position(member: 0, mediaSeconds: 4) == 1)
    #expect(single.position(member: 0, mediaSeconds: 1) == 0)
    #expect(throws: (any Error).self) { try single.locate(-0.1) }
  }
  @Test func mapsSelectedTimeWithoutCountingGaps() throws {
    let timeline = try VideoSegmentTimeline(segments: [
      .init(start: 0.2, end: 0.6), .init(start: 1.8, end: 2.4)])
    #expect(abs(timeline.duration - 1) < 0.000001)
    let boundary = try timeline.locate(0.6 - 0.2)
    #expect(boundary.member == 1)
    #expect(abs(boundary.mediaSeconds - 1.8) < 0.000001)
    #expect(abs(timeline.position(member: 1, mediaSeconds: 2) - 0.6) < 0.000001)
    #expect(try timeline.locate(timeline.duration).member == 1)
    #expect(throws: (any Error).self) { try timeline.locate(.nan) }
    #expect(throws: (any Error).self) { try timeline.locate(1.1) }
  }
}
