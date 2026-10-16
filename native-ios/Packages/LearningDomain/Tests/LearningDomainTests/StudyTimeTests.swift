import Foundation
import Testing
@testable import LearningDomain

@Suite struct StudyTimeTests {
    @Test func invalidCountersCannotEnterPersistenceOrDecodedBackups() throws {
        for amount: Int64 in [-1, 9_007_199_254_740_992] {
            #expect(throws: LearningError.invalidState) {
                try StudyTimeCounter(language: "english", book: "morning-notes", replicaID: "abc", milliseconds: amount)
            }
        }
        for (language, book, replica) in [("unknown", "book", "abc"), ("english", "../book", "abc"),
                                          ("english", "book", ""), ("english", "book", "A B")] {
            #expect(throws: LearningError.self) {
                try StudyTimeCounter(language: language, book: book, replicaID: replica, milliseconds: 1)
            }
        }
        let malformed = Data(#"{"language":"english","book":"book","replicaID":"abc","milliseconds":-1}"#.utf8)
        #expect(throws: (any Error).self) { try JSONDecoder().decode(StudyTimeCounter.self, from: malformed) }
    }

    @Test func sameReplicaUsesMaximumAndDifferentReplicasSumOnce() throws {
        let a = try StudyTimeCounter(language: "english", book: "book", replicaID: "a", milliseconds: 10_000)
        let older = try StudyTimeCounter(language: "english", book: "book", replicaID: "a", milliseconds: 8_000)
        let b = try StudyTimeCounter(language: "english", book: "book", replicaID: "b", milliseconds: 4_000)
        let other = try StudyTimeCounter(language: "japanese", book: "book", replicaID: "a", milliseconds: 50_000)
        let left = try StudyTimeCounter.merged([a, older, b, other])
        #expect(try StudyTimeCounter.total(left, language: "english", book: "book") == 14_000)
        #expect(try StudyTimeCounter.merged(left + left) == left)
        #expect(try StudyTimeCounter.merged([b, other, older, a]) == left)
        #expect(try StudyTimeCounter.merged(StudyTimeCounter.merged([a, older]) + [b, other]) == left)
    }

    @Test func totalsRejectOverflowInsteadOfWrappingOrLosingPrecision() throws {
        let a = try StudyTimeCounter(language: "english", book: "book", replicaID: "a", milliseconds: 9_007_199_254_740_991)
        let b = try StudyTimeCounter(language: "english", book: "book", replicaID: "b", milliseconds: 1)
        #expect(throws: LearningError.invalidState) { try StudyTimeCounter.total([a, b], language: "english", book: "book") }
    }
}
