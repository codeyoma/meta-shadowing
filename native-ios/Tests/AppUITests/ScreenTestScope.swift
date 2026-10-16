import Foundation

/// A missing scope keeps the manual full journey. Invalid scopes fail closed.
struct ScreenTestScope {
    private let screens: Set<String>?
    static let known: Set<String> = ["bookshelf", "stages", "player", "options", "guide", "rate", "typography",
                                     "reveal", "grouping", "settings", "sync", "data", "experience", "analysis", "dictionary",
                                     "diagnostics", "launch", "navigation", "probes"]
    init(value: String? = ProcessInfo.processInfo.environment["NATIVE_UI_SCREEN_SCOPE"]) throws {
        guard let value else { screens = nil; return }
        let selected = value.split(separator: ",", omittingEmptySubsequences: false).map(String.init)
        guard !selected.isEmpty, Set(selected).isSubset(of: Self.known) else {
            throw CocoaError(.fileReadCorruptFile)
        }
        screens = Set(selected)
    }
    func contains(_ screen: String) -> Bool { screens?.contains(screen) ?? true }
    var needsLearning: Bool { ["player", "options", "rate"].contains(where: contains) }
    var needsSettings: Bool { ["settings", "typography"].contains(where: contains) }
    var needsStages: Bool { contains("stages") || needsLearning }
}
