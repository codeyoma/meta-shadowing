import Foundation
import Testing
@testable import LearningDomain

func samplePlan(stage: Int = 1, count: Int = 5, size: Int = 2, run: String = "run") throws -> LearningPlan {
    try LearningPlan.make(
        scope: LearningScope(profileID: "guest", packageKey: "sample-v1", language: "english", book: "sample", stage: stage),
        runID: run, sources: (0..<count).map { LearningSource(index: $0, text: "Hello world.", translation: "안녕하세요.") },
        groupSize: size)
}

struct LearningPlanTests {
    @Test func scopesCannotCommitAnUnexportablePackageIdentity() throws {
        for (package, language, book) in [("sample-v0", "english", "sample"), ("sample-v1", "korean", "sample"),
            ("other-v1", "english", "sample"), ("sample-v01", "english", "sample"), ("Sample-v1", "english", "Sample")] {
            #expect(throws: LearningError.self) { try LearningScope(profileID: "guest", packageKey: package, language: language, book: book, stage: 1) }
        }
    }
    @Test(arguments: 1...16) func plansCoverAllSixteenStages(stage: Int) throws {
        let plan = try samplePlan(stage: stage)
        #expect(plan.units.count == ((7...10).contains(stage) ? 3 : 5))
        let policy = try StagePolicy.forStage(stage)
        #expect(policy.defaultCycles == (stage >= 11 ? 1 : 3))
        #expect(policy.firstWordHints == [5, 6, 9, 10].contains(stage))
        #expect(policy.isSilent == (stage >= 11))
    }

    @Test func partialGroupRemainsSeparate() throws {
        #expect(try samplePlan(stage: 7).units == [[0, 1], [2, 3], [4]])
        #expect(try samplePlan(stage: 7, size: 3).units == [[0, 1, 2], [3, 4]])
    }

    @Test func invalidPlansAreRejected() throws {
        for stage in [0, 17] { #expect(throws: (any Error).self) { try samplePlan(stage: stage) } }
        for size in [0, 1, 5] { #expect(throws: (any Error).self) { try samplePlan(size: size) } }
        #expect(throws: (any Error).self) { try samplePlan(count: 0) }
        #expect(throws: (any Error).self) { try samplePlan(count: 100001) }
        let plan = try samplePlan()
        #expect(throws: (any Error).self) {
            try LearningPlan.make(scope: plan.scope, runID: "run", sources: [plan.sources[0], plan.sources[0]], groupSize: 2)
        }
        #expect(throws: (any Error).self) { try samplePlan(run: " ") }
    }

    @Test func decodedIdentityAndPlanAreValidated() throws {
        let data = try JSONEncoder().encode(samplePlan())
        #expect(try JSONDecoder().decode(LearningPlan.self, from: data) == samplePlan())
        let invalid = String(decoding: data, as: UTF8.self).replacingOccurrences(of: "\"stage\":1", with: "\"stage\":17")
        #expect(throws: (any Error).self) { try JSONDecoder().decode(LearningPlan.self, from: Data(invalid.utf8)) }
    }
}
