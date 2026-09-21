import Testing

struct LessonRemoteTests {
  @Test func doublePressConsumesRepeatInsteadOfNextAndOnlyOnce() {
    var remote = LessonRemoteState()
    remote.begin("lesson")
    remote.update(owner: "lesson", revision: "third", actionable: true, repeatable: true, since: 5)
    let event = remote.take(action: .repeatPractice, at: 6, foreground: true, wired: true)
    #expect(event?.action == .repeatPractice)
    #expect(event?.revision == "third")
    #expect(remote.take(at: 7, foreground: true, wired: true) == nil)
    #expect(remote.take(action: .repeatPractice, at: 8, foreground: true, wired: true) == nil)
  }

  @Test func unavailableRepeatCannotConsumeOrFallThroughToMain() {
    var remote = LessonRemoteState()
    remote.begin("lesson")
    remote.update(owner: "lesson", revision: "first", actionable: true)
    #expect(remote.take(action: .repeatPractice, at: 1, foreground: true, wired: true) == nil)
    #expect(remote.take(at: 2, foreground: true, wired: true)?.action == .main)
    remote.update(owner: "lesson", revision: "third", actionable: true, repeatable: true, since: 5)
    #expect(remote.take(action: .repeatPractice, at: 4, foreground: true, wired: true) == nil)
    #expect(remote.take(action: .repeatPractice, at: 6, foreground: false, wired: true) == nil)
    #expect(remote.take(action: .repeatPractice, at: 7, foreground: true, wired: false) == nil)
    remote.update(owner: "lesson", revision: "menu", actionable: false, repeatable: false)
    #expect(remote.take(action: .repeatPractice, at: 8, foreground: true, wired: true) == nil)
  }

  @Test func aQueuedClickCannotConfirmAnActionThatBecameReadyLater() {
    var remote = LessonRemoteState()
    remote.begin("lesson")
    remote.update(owner: "lesson", revision: "new-action", actionable: true, since: 10)
    #expect(remote.take(at: 9.9, foreground: true, wired: true) == nil)
    #expect(remote.take(at: 10.1, foreground: true, wired: true) != nil)
  }
  @Test func onlyAnArmedCurrentLessonCanAdvanceOnce() {
    var remote = LessonRemoteState()
    remote.begin("lesson-a")
    remote.update(owner: "lesson-a", revision: "confirm-1", actionable: true)
    #expect(remote.take(at: 10, foreground: true, wired: true)?.revision == "confirm-1")
    #expect(remote.take(at: 11, foreground: true, wired: true) == nil)
    // Repeated renders of the same action cannot rearm a consumed command.
    remote.update(owner: "lesson-a", revision: "confirm-1", actionable: true)
    #expect(remote.take(at: 12, foreground: true, wired: true) == nil)
    remote.update(owner: "lesson-a", revision: "confirm-2", actionable: true)
    #expect(remote.take(at: 12, foreground: true, wired: true)?.owner == "lesson-a")
  }

  @Test func menusBackgroundUnsupportedRoutesAndPlaybackNeverAdvance() {
    var remote = LessonRemoteState()
    remote.begin("lesson")
    remote.update(owner: "lesson", revision: "menu", actionable: false)
    #expect(remote.take(at: 1, foreground: true, wired: true) == nil)
    remote.update(owner: "lesson", revision: "confirm", actionable: true)
    #expect(remote.take(at: 2, foreground: false, wired: true) == nil)
    #expect(remote.take(at: 3, foreground: true, wired: false) == nil)
    #expect(remote.take(at: 4, foreground: true, wired: true) != nil)
  }

  @Test func staleUpdatesCleanupAndButtonBounceCannotAffectAnotherLesson() {
    var remote = LessonRemoteState()
    remote.begin("old")
    remote.begin("new")
    remote.update(owner: "new", revision: "first", actionable: true)
    remote.update(owner: "old", revision: "stale", actionable: false)
    let staleEnd = remote.end("old")
    #expect(!staleEnd)
    #expect(remote.take(at: 10, foreground: true, wired: true)?.owner == "new")
    remote.update(owner: "new", revision: "second", actionable: true)
    #expect(remote.take(at: 10.1, foreground: true, wired: true) == nil)
    #expect(remote.take(at: 10.5, foreground: true, wired: true)?.revision == "second")
    let ended = remote.end("new")
    #expect(ended)
    #expect(remote.take(at: 12, foreground: true, wired: true) == nil)
  }
}
