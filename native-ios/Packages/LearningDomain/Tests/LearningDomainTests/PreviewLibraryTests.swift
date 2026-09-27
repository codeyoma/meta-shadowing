import Foundation
import LearningDomain
import Testing

struct PreviewLibraryTests {
    @Test(arguments: [
        #"{"schemaVersion":1,"lessons":[]}"#,
        #"{"schemaVersion":1,"lessons":[{"id":"a","title":"  ","sentences":[{"id":"one","source":"Hi.","translation":"안녕."}]}]}"#,
        #"{"schemaVersion":1,"lessons":[{"id":"a","title":"Sample","sentences":[]}]}"#,
        #"{"schemaVersion":1,"lessons":[{"id":"a","title":"Sample","sentences":[{"id":"one","source":" ","translation":"안녕."}]}]}"#,
        #"{"schemaVersion":1,"lessons":[{"id":"a","title":"Sample","sentences":[{"id":"one","source":"Hi.","translation":"안녕."},{"id":"one","source":"Bye.","translation":"잘 가."}]}]}"#,
        #"{"schemaVersion":1,"lessons":[{"id":"a","title":"First","sentences":[{"id":"s","source":"Hi.","translation":"안녕."}]},{"id":"a","title":"Second","sentences":[{"id":"s","source":"Bye.","translation":"잘 가."}]}]}"#
    ]) func rejectsEmptyOrAmbiguousContent(json: String) {
        #expect(throws: (any Error).self) { try PreviewLibrary.decode(Data(json.utf8)) }
    }

    @Test(arguments: [0, 2]) func rejectsUnsupportedSchema(version: Int) {
        let data = Data("{\"schemaVersion\":\(version),\"lessons\":[]}".utf8)
        #expect(throws: (any Error).self) { try PreviewLibrary.decode(data) }
    }

    @Test func decodesSyntheticSentencePairs() throws {
        let data = Data(#"{"schemaVersion":1,"lessons":[{"id":"preview","title":"Native sample","sentences":[{"id":"one","source":"Hello.","translation":"안녕하세요."}]}]}"#.utf8)
        let library = try PreviewLibrary.decode(data)
        #expect(library.lessons.count == 1)
        let lesson = try #require(library.lessons.first)
        #expect(lesson.id == "preview")
        #expect(lesson.title == "Native sample")
        #expect(lesson.sentences.first?.translation == "안녕하세요.")
    }
}
