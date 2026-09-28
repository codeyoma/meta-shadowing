import Foundation

public enum LessonRemoteAction: Sendable { case main, repeatPractice }
public struct LessonRemoteEvent: Equatable, Sendable {
    public let owner: String
    public let revision: String
    public let action: LessonRemoteAction
}

/// One physical press consumes one displayed revision, never a subsequent cycle.
public struct LessonRemoteState {
    public private(set) var owner: String?
    private var revision = ""
    private var actionable = false, repeatable = false
    private var consumed: String?
    private var readySince = 0.0, lastPress = -Double.infinity
    public init() {}
    public mutating func begin(_ owner: String) { self = Self(); self.owner = owner }
    public mutating func update(owner: String, revision: String, actionable: Bool, repeatable: Bool, since: Double) {
        guard self.owner == owner else { return }
        if self.revision != revision { readySince = since }
        self.revision = revision; self.actionable = actionable; self.repeatable = repeatable
    }
    public mutating func take(action: LessonRemoteAction, at time: Double, foreground: Bool, wired: Bool) -> LessonRemoteEvent? {
        guard let owner, action == .main ? actionable : repeatable, foreground, wired, consumed != revision,
              time.isFinite, time >= readySince, time - lastPress >= 0.35 else { return nil }
        consumed = revision; lastPress = time
        return LessonRemoteEvent(owner: owner, revision: revision, action: action)
    }
    @discardableResult public mutating func end(_ owner: String) -> Bool {
        guard self.owner == owner else { return false }
        self = Self(); return true
    }
}
