import Foundation
import Testing
@testable import LearningMedia

struct VideoMediaTimelineTests {
    private let file = URL(fileURLWithPath: "/fixture/source.mp4")

    @Test func overlapIsCountedOnceWhileExcludedGapsStayExcluded() throws {
        let timeline = try VideoMediaTimeline(sources: [
            .video(file: file, start: 1, end: 3), .video(file: file, start: 2.8, end: 4),
            .video(file: file, start: 6, end: 7), .video(file: file, start: 7, end: 8)])
        #expect(abs(timeline.selected.duration - 5) < 0.0001)
        let overlap = try timeline.selected.locate(1.9)
        #expect(overlap.member == 1)
        #expect(abs(timeline.segments[overlap.member].start + overlap.localSeconds - 2.9) < 0.0001)
        let gap = try timeline.selected.locate(3)
        #expect(gap.member == 2)
        #expect(gap.localSeconds == 0)
        let final = try timeline.selected.locate(5)
        #expect(final.member == 3)
        #expect(timeline.segments[final.member].start + final.localSeconds == 8)
        #expect(throws: MediaFailure.invalidAsset) { try timeline.selected.locate(5.1) }
    }

    @Test func singleMemberRetainsItsWholeOriginalInterval() throws {
        let timeline = try VideoMediaTimeline(sources: [.video(file: file, start: 2.8, end: 4)])
        #expect(timeline.segments[0].start == 2.8)
        #expect(timeline.segments[0].end == 4)
        #expect(abs(timeline.selected.duration - 1.2) < 0.0001)
    }

    @Test(arguments: [(-1.0, 4.0), (0.5, 4.0), (1.0, 4.0), (2.0, 2.5), (4.0, 4.0), (.nan, 4.0), (2.0, .infinity)])
    func invalidOrReversedRangesRemainRejected(_ range: (Double, Double)) {
        #expect(throws: MediaFailure.invalidAsset) {
            try VideoMediaTimeline(sources: [.video(file: file, start: 1, end: 3),
                .video(file: file, start: range.0, end: range.1)])
        }
    }
}
