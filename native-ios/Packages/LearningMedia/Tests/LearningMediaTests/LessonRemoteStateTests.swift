import Testing
import LearningMedia

struct LessonRemoteStateTests {
    @Test func headsetRevisionCanBeConsumedOnce() {
        var remote = LessonRemoteState()
        remote.begin("lesson")
        remote.update(owner: "lesson", revision: "third", actionable: true, repeatable: true, since: 1)
        let repeatAction = remote.take(action: .repeatPractice, at: 1, foreground: true, wired: true)
        #expect(repeatAction?.action == .repeatPractice)
        #expect(remote.take(action: .main, at: 2, foreground: true, wired: true) == nil)
        remote.update(owner: "lesson", revision: "fourth", actionable: true, repeatable: false, since: 3)
        #expect(remote.take(action: .main, at: 2, foreground: true, wired: true) == nil)
        #expect(remote.take(action: .repeatPractice, at: 3, foreground: true, wired: true) == nil)
        #expect(remote.take(action: .main, at: 3, foreground: false, wired: true) == nil)
        #expect(remote.take(action: .main, at: 3, foreground: true, wired: false) == nil)
        let mainAction = remote.take(action: .main, at: 3, foreground: true, wired: true)
        #expect(mainAction?.revision == "fourth")
        remote.begin("replacement")
        let ended = remote.end("lesson")
        #expect(!ended)
        #expect(remote.owner == "replacement")
    }
}
