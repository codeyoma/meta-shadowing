import Foundation
import LearningDomain
import Testing
@testable import AppFoundation

@Suite struct LearningUnitPresentationTests {
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
    @Test(arguments: [5, 9, 11, 13, 15])
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
