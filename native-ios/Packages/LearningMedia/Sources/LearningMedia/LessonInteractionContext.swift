public struct LessonInteractionContext: Equatable, Sendable {
    public var foreground: Bool
    public var menuOpen: Bool
    public var access: Bool
    public var complete: Bool
    public init(foreground: Bool = true, menuOpen: Bool = false, access: Bool = true, complete: Bool = false) {
        self.foreground = foreground; self.menuOpen = menuOpen; self.access = access; self.complete = complete
    }
    public var actionable: Bool { foreground && !menuOpen && access && !complete }
}

public enum SuspensionReason: Sendable { case userPause, menu, inactivity, routeChange, interruption, failure }
