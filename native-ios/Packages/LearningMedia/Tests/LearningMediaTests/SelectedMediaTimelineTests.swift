import Testing
import LearningMedia

struct SelectedMediaTimelineTests {
    @Test func exactBoundarySelectsNextAudioMember() throws {
        let timeline = try SelectedMediaTimeline(durations: [1, 2, 0.5])
        #expect(timeline.duration == 3.5)
        #expect(try timeline.locate(1).member == 1)
        #expect(try timeline.locate(1).localSeconds == 0)
        #expect(try timeline.locate(3).member == 2)
        #expect(try timeline.locate(3.5).localSeconds == 0.5)
        #expect(try timeline.position(member: 1, localSeconds: 0.5) == 1.5)
    }

    @Test(arguments: [[], [0], [-1], [.nan], [.infinity], [1, 1, 1, 1, 1], [Double.greatestFiniteMagnitude, Double.greatestFiniteMagnitude]])
    func invalidDurationsCannotCreateTimeline(_ durations: [Double]) {
        #expect(throws: MediaFailure.invalidAsset) { try SelectedMediaTimeline(durations: durations) }
    }

    @Test(arguments: [-0.1, 2.1, Double.nan, Double.infinity])
    func invalidCheckpointPositionIsRejected(_ seconds: Double) throws {
        let timeline = try SelectedMediaTimeline(durations: [1, 1])
        #expect(throws: MediaFailure.invalidAsset) { try timeline.locate(seconds) }
    }

    @Test func samplesStayWithinTheirMember() throws {
        let timeline = try SelectedMediaTimeline(durations: [1, 2])
        #expect(try timeline.position(member: 1, localSeconds: -0.1) == 1)
        #expect(try timeline.position(member: 1, localSeconds: 2.1) == 3)
        #expect(throws: MediaFailure.invalidAsset) { try timeline.position(member: 3, localSeconds: 0) }
        #expect(throws: MediaFailure.invalidAsset) { try timeline.position(member: 0, localSeconds: .nan) }
    }
}
