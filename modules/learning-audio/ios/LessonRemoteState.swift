import Foundation

enum LessonRemoteAction: String {
  case main
  case repeatPractice = "repeat"
}

struct LessonRemoteEvent: Equatable {
  let owner: String
  let revision: String
  let action: LessonRemoteAction
}

/// One physical click can consume one currently displayed action, never a later one.
struct LessonRemoteState {
  private(set) var owner: String?
  private var revision = ""
  private var actionable = false
  private var repeatable = false
  private var consumed: String?
  private var readySince = 0.0
  private var lastPress = -Double.infinity

  mutating func begin(_ owner: String) {
    self = LessonRemoteState()
    self.owner = owner
  }
  mutating func update(owner: String, revision: String, actionable: Bool, repeatable: Bool = false, since: Double = 0) {
    guard self.owner == owner else { return }
    if self.revision != revision { readySince = since }
    self.revision = revision
    self.actionable = actionable
    self.repeatable = repeatable
  }
  mutating func take(action: LessonRemoteAction = .main, at time: Double, foreground: Bool, wired: Bool) -> LessonRemoteEvent? {
    let allowed = action == .main ? actionable : repeatable
    guard let owner, allowed, foreground, wired, consumed != revision,
          time.isFinite, time >= readySince, time - lastPress >= 0.35 else { return nil }
    consumed = revision
    lastPress = time
    return LessonRemoteEvent(owner: owner, revision: revision, action: action)
  }
  @discardableResult mutating func end(_ owner: String) -> Bool {
    guard self.owner == owner else { return false }
    self = LessonRemoteState()
    return true
  }
}
