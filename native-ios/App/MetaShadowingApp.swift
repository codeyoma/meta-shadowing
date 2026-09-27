import AppFoundation
import LearningDomain
import SwiftUI

@main
struct MetaShadowingApp: App {
    @State private var bootstrap: AppBootstrap

    init() {
        let workspace = PreviewWorkspace(root: URL.applicationSupportDirectory)
        #if DEBUG
        if ProcessInfo.processInfo.arguments.contains("--ui-test-fail-first-load") {
            let loader = FailFirstPreviewLoad(workspace: workspace)
            bootstrap = AppBootstrap { try await loader.load() }
            return
        }
        #endif
        bootstrap = AppBootstrap { try await workspace.loadLibrary() }
    }

    var body: some Scene {
        WindowGroup {
            RootView(bootstrap: bootstrap)
        }
    }
}

#if DEBUG
/// Deterministic UI-test failure; never compiled into the Release product.
private actor FailFirstPreviewLoad {
    let workspace: PreviewWorkspace
    private var failed = false

    init(workspace: PreviewWorkspace) { self.workspace = workspace }

    func load() async throws -> PreviewLibrary {
        if !failed {
            failed = true
            throw CocoaError(.fileReadUnknown)
        }
        return try await workspace.loadLibrary()
    }
}
#endif
