import Foundation
import Testing
@testable import LearningDomain

struct ReferenceTraceTests {
    struct Fixture: Decodable {
        struct Plan: Decodable { let stage: Int; let groupSize: Int; let units: [[Int]]; let defaultCycles: Int }
        struct State: Decodable {
            let phrase: Int; let phase: String; let running: Bool; let audioSeconds: Double
            let unitProgress: [UnitProgress]
        }
        struct Action: Decodable {
            let type: String; let seconds: Double?
            var event: LearningEvent {
                get throws {
                    switch type {
                    case "resume": .resume
                    case "audio-position": .position(try #require(seconds))
                    case "audio-ended": .playbackEnded
                    case "confirm": .confirm
                    case "next": .next
                    default: throw LearningError.invalidEvent
                    }
                }
            }
        }
        struct Trace: Decodable {
            struct Step: Decodable { let action: Action; let state: State; let xp: Int64 }
            let stage: Int; let groupSize: Int; let steps: [Step]
        }
        let plans: [Plan]
        let traces: [Trace]
        struct Regroup: Decodable {
            struct State: Decodable { let phrase: Int; let sourceProgress: [UnitProgress] }
            let size: Int; let nextSize: Int; let state: State
        }
        struct Reveal: Decodable {
            struct Phrase: Decodable { let text: String; let translation: String }
            let stage: Int; let seconds: Double; let phrase: Phrase; let texts: [String]
        }
        let regroupings: [Regroup]
        let reveals: [Reveal]
        struct Level: Decodable { let xp: Int64; let before: LevelProgress; let after: LevelProgress }
        let levels: [Level]
    }
    @Test func plansMatchIndependentTypeScriptReference() throws {
        let url = try #require(Bundle.module.url(forResource: "learning-reference", withExtension: "json", subdirectory: "Fixtures"))
        let fixture = try JSONDecoder().decode(Fixture.self, from: Data(contentsOf: url))
        #expect(fixture.plans.count == 48)
        for entry in fixture.plans {
            #expect(try samplePlan(stage: entry.stage, size: entry.groupSize).units == entry.units)
            #expect(try StagePolicy.forStage(entry.stage).defaultCycles == entry.defaultCycles)
        }
    }

    @Test func transitionsMatchIndependentTypeScriptReference() throws {
        let url = try #require(Bundle.module.url(forResource: "learning-reference", withExtension: "json", subdirectory: "Fixtures"))
        let fixture = try JSONDecoder().decode(Fixture.self, from: Data(contentsOf: url))
        for trace in fixture.traces {
            var state = try startSession(stage: trace.stage, count: 5, size: trace.groupSize)
            var ledger = RewardLedger()
            for entry in trace.steps {
                let change = try LearningReducer.reduce(state, event: entry.action.event)
                ledger = try ledger.record(transition: change, day: StudyDay("2026-09-27"))
                state = change.session
                #expect(state.unit == entry.state.phrase)
                #expect(state.phase.rawValue == entry.state.phase)
                #expect(state.running == entry.state.running)
                #expect(state.positionSeconds == entry.state.audioSeconds)
                #expect(state.units == entry.state.unitProgress)
                #expect(try ledger.totalXP(language: "english") == entry.xp)
            }
        }
    }
    @Test func levelsMatchIndependentReference() throws {
        let url = try #require(Bundle.module.url(forResource: "learning-reference", withExtension: "json", subdirectory: "Fixtures"))
        let fixture = try JSONDecoder().decode(Fixture.self, from: Data(contentsOf: url))
        #expect(fixture.levels.count == 998)
        for entry in fixture.levels {
            #expect(try LevelProgress.forXP(entry.xp - 1) == entry.before)
            #expect(try LevelProgress.forXP(entry.xp) == entry.after)
        }
    }
    @Test func regroupAndRevealMatchReference() throws {
        let url = try #require(Bundle.module.url(forResource: "learning-reference", withExtension: "json", subdirectory: "Fixtures"))
        let fixture = try JSONDecoder().decode(Fixture.self, from: Data(contentsOf: url))
        for entry in fixture.regroupings {
            let state = try step(ended(startSession(stage: 7, count: 5, size: entry.size)), .confirm)
            let changed = try LearningRegrouping.apply(state, size: entry.nextSize, newPlanID: "new-\(entry.nextSize)")
            #expect(changed.unit == entry.state.phrase)
            #expect(changed.sourceProgress.map { UnitProgress(confirmed: $0.confirmed, planned: $0.planned) } == entry.state.sourceProgress)
        }
        for entry in fixture.reveals {
            let lines = try RevealTimeline.lines(source: LearningSource(index: 0, text: entry.phrase.text, translation: entry.phrase.translation), stage: entry.stage)
            #expect(try RevealTimeline.visible(lines: lines, seconds: entry.seconds, WPM: 150, completed: false).map(\.visibleText) == entry.texts)
        }
    }
}
