import Foundation
import LearningDomain
import Testing
@testable import AppFoundation

@Suite struct LearningUnitPresentationTests {
    @Test(arguments: [7, 9])
    func fullscreenMemberKeepsPairsHintsAndOriginalSession(_ stage: Int) throws {
        let scope = try LearningScope(profileID: "text", packageKey: "sample-v1", language: "english", book: "sample", stage: stage)
        let plan = try LearningPlan.make(scope: scope, runID: "captions", sources: [
            .init(index: 0, text: "First phrase", translation: "첫 구간"),
            .init(index: 1, text: "Second secret phrase", translation: "둘째 구간")
        ], groupSize: 2)
        let session = try LearningSession.start(plan: plan, preferences: .fresh)
        let before = session
        let caption = try LearningUnitPresentation.make(session: session, revealOriginal: false,
                                                        elapsedSeconds: 0, sourceMember: 1)
        #expect(caption.lines.map(\.sourceIndex) == [1, 1])
        #expect(caption.lines.map(\.accessibleText) == [stage == 9 ? "Second …" : "Second secret phrase", "둘째 구간"])
        let shown = try LearningUnitPresentation.make(session: session, revealOriginal: true,
                                                      elapsedSeconds: 0, sourceMember: 1)
        #expect(shown.lines.map(\.accessibleText) == ["Second secret phrase", "둘째 구간"])
        let portrait = try LearningUnitPresentation.make(session: session, revealOriginal: true, elapsedSeconds: 0)
        #expect(portrait.lines.map(\.sourceIndex) == [0, 0, 1, 1])
        #expect(throws: ProductError.invalidContent) {
            try LearningUnitPresentation.make(session: session, revealOriginal: false, elapsedSeconds: 0, sourceMember: 2)
        }
        #expect(session == before)
    }

    @Test func finalShortGroupUsesLocalMemberIndex() throws {
        let scope = try LearningScope(profileID: "text", packageKey: "sample-v1", language: "english", book: "sample", stage: 7)
        let plan = try LearningPlan.make(scope: scope, runID: "short-caption", sources: [
            .init(index: 0, text: "First", translation: "하나"),
            .init(index: 1, text: "Second", translation: "둘"),
            .init(index: 2, text: "Last", translation: "셋")
        ], groupSize: 2)
        let start = try LearningSession.start(plan: plan, preferences: .fresh)
        let session = try LearningReducer.reduce(start, event: .selectSource(2)).session
        let caption = try LearningUnitPresentation.make(session: session, revealOriginal: true,
                                                        elapsedSeconds: 0, sourceMember: 0)
        #expect(caption.lines.map(\.accessibleText) == ["Last", "셋"])
        #expect(caption.lines.map(\.sourceIndex) == [2, 2])
        #expect(throws: ProductError.invalidContent) {
            try LearningUnitPresentation.make(session: session, revealOriginal: true, elapsedSeconds: 0, sourceMember: 1)
        }
    }

    @Test(arguments: [1, 2, 3, 4, 7, 8])
    func nonHintStagesAlwaysShowTargetText(_ stage: Int) throws {
        let scope = try LearningScope(profileID: "text", packageKey: "sample-v1", language: "english", book: "sample", stage: stage)
        let plan = try LearningPlan.make(scope: scope, runID: "subtitled", sources: [
            .init(index: 0, text: "Hello world.", translation: "안녕 세상.")
        ], groupSize: 2)
        let session = try LearningSession.start(plan: plan, preferences: .fresh)
        let presentation = try LearningUnitPresentation.make(session: session, revealOriginal: false, elapsedSeconds: 0)
        #expect(presentation.lines.map(\.accessibleText) == ["Hello world.", "안녕 세상."])
        #expect(presentation.lines.allSatisfy { $0.spans.allSatisfy(\.visible) })
    }

    @Test func matchingDialoguePairsStayTogetherAndMismatchStaysIntact() throws {
        let scope = try LearningScope(profileID: "text", packageKey: "sample-v1", language: "english", book: "sample", stage: 7)
        let sources = [
            LearningSource(index: 0, text: "\"One.\" \"Two!\"", translation: "\"하나.\" \"둘!\""),
            LearningSource(index: 1, text: "\"Three.\" \"Four.\"", translation: "셋과 넷.")
        ]
        let plan = try LearningPlan.make(scope: scope, runID: "dialogue", sources: sources, groupSize: 2)
        let session = try LearningSession.start(plan: plan, preferences: .fresh)
        let presentation = try LearningUnitPresentation.make(session: session, revealOriginal: true, elapsedSeconds: 0)
        #expect(presentation.lines.map(\.accessibleText) == ["One.", "하나.", "Two!", "둘!", "\"Three.\" \"Four.\"", "셋과 넷."])
        #expect(presentation.bubbles.map { $0.lines.map(\.accessibleText) } == [
            ["One.", "하나."], ["Two!", "둘!"], ["\"Three.\" \"Four.\"", "셋과 넷."]
        ])
        #expect(presentation.bubbles.map(\.id) == ["0-0", "0-1", "1-0"])
    }

    @Test func partialRevealPreservesLanguageOrderAndCompletion() throws {
        let scope = try LearningScope(profileID: "text", packageKey: "sample-v1", language: "english", book: "sample", stage: 13)
        let plan = try LearningPlan.make(scope: scope, runID: "reveal", sources: [
            .init(index: 0, text: "Hello world", translation: "안녕 세상")
        ], groupSize: 2)
        let session = try LearningSession.start(plan: plan, preferences: .fresh)
        let partial = try LearningUnitPresentation.make(session: session, revealOriginal: true, elapsedSeconds: 0.4)
        #expect(partial.lines.map(\.accessibleText) == ["안녕", ""])
        let ended = try LearningReducer.reduce(LearningReducer.reduce(session, event: .resume).session, event: .playbackEnded).session
        let completed = try LearningUnitPresentation.make(session: ended, revealOriginal: false, elapsedSeconds: 0)
        #expect(completed.lines.map(\.accessibleText) == ["안녕 세상", "Hello world"])
    }
    @Test(arguments: [5, 6, 9, 10, 11, 13, 15])
    func hiddenTextHasNoAccessibleFullTarget(_ stage: Int) throws {
        let scope = try LearningScope(profileID: "text", packageKey: "sample-v1", language: "english", book: "sample", stage: stage)
        let plan = try LearningPlan.make(scope: scope, runID: "text", sources: [
            .init(index: 0, text: "Hello secret world.", translation: "안녕 비밀 세상.")
        ], groupSize: 2)
        let session = try LearningSession.start(plan: plan, preferences: .fresh)
        let presentation = try LearningUnitPresentation.make(session: session, revealOriginal: false, elapsedSeconds: 0)
        let labels = presentation.lines.map(\.accessibleText).joined(separator: " ")
        #expect(!labels.contains("secret"))
        #expect(!labels.contains("world"))
        if stage < 11 { #expect(labels == "Hello … 안녕 비밀 세상.") }
        else { #expect(labels.trimmingCharacters(in: .whitespaces).isEmpty) }
        if stage == 15 { #expect(presentation.lines.allSatisfy { $0.kind == .translation }) }
    }
}
