import Testing
@testable import LearningDomain

struct RevealTimelineTests {
    let source = LearningSource(index: 0, text: "Hello,  world!\nAgain.", translation: "안녕 하세요.")
    @Test func silentOrderAndWhitespaceAreStable() throws {
        #expect(try RevealTimeline.lines(source: source, stage: 11).map(\.kind) == [.target, .translation])
        #expect(try RevealTimeline.lines(source: source, stage: 13).map(\.kind) == [.translation, .target])
        #expect(try RevealTimeline.lines(source: source, stage: 16).map(\.kind) == [.translation])
        let lines = try RevealTimeline.lines(source: source, stage: 11)
        let visible = try RevealTimeline.visible(lines: lines, seconds: 0.8, WPM: 150, completed: false)
        #expect(visible[0].visibleText == "Hello,  world!")
        #expect(visible[1].visibleText == "")
        #expect(visible[0].spans.map(\.text).joined() == source.text)
        #expect(try RevealTimeline.visible(lines: lines, seconds: 0, WPM: 150, completed: true)[0].visibleText == source.text)
    }
    @Test func speedChangePreservesPartialWord() throws {
        var state = try step(step(startSession(stage: 11), .resume), .position(0.2))
        #expect(throws: (any Error).self) { try step(state, .changeRevealSpeed(level: 4, presets: [150, 200, 250, 300])) }
        state = try step(state, .pause)
        state = try step(state, .changeRevealSpeed(level: 4, presets: [150, 200, 250, 300]))
        #expect(state.positionSeconds == 0.1 && state.reveal?.WPM == 300)
        #expect(LearningPreferences.fresh.revealWPM == [150, 200, 250, 300])
    }
    @Test func silentRestoreKeepsCompletedReveal() throws {
        let state = try ended(startSession(stage: 11))
        let restored = try state.validatedForRestore(expected: state.plan.scope, sourceCount: 1)
        #expect(try step(restored, .stageEntry).phase == .speaking)
        #expect(try LearningReducer.reduce(restored, event: .stageEntry).intents.isEmpty)
        #expect(!state.canRepeat)
        #expect(try step(state, .confirm).phase == .complete)
    }
    @Test func emptyRevealAndInvalidInputsAreBounded() throws {
        let lines = try RevealTimeline.lines(source: LearningSource(index: 0, text: "", translation: " "), stage: 15)
        #expect(try RevealTimeline.duration(lines: lines, WPM: 150) == 0.4)
        #expect(throws: (any Error).self) { try RevealTimeline.visible(lines: lines, seconds: .nan, WPM: 150, completed: false) }
        #expect(throws: (any Error).self) { try RevealTimeline.duration(lines: lines, WPM: 0) }
    }
}
