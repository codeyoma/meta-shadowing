import Testing
@testable import LearningReference

struct SentenceRelationsTests {
    @Test func selectedRelationsPreserveDirectionAndRoot() throws {
        let sentence = try SentenceAnalysisReader.read(syntaxFixture(), sources: sources(), language: "en", sourceIndices: [0])[0]
        let root = SentenceRelations.project(sentence, selected: 1)
        #expect(root.root)
        #expect(root.edges.map(\.dependent) == [0, 2])
        #expect(root.edges.map(\.head) == [1, 1])
        #expect(root.connected == [0, 1, 2])
        #expect(SentenceRelations.project(sentence, selected: 0).edges.map(\.label) == ["NSUBJ"])
        #expect(SentenceRelations.project(sentence, selected: nil).edges.count == 2)
        #expect(SentenceRelations.project(sentence, selected: 99).edges.isEmpty)
        #expect(AnalysisVocabulary.pos("VERB") == "동사")
        #expect(AnalysisVocabulary.englishRelation("NSUBJ") == "nominal subject")
        #expect(AnalysisVocabulary.englishRelation("NEW") == "new")
    }
}
