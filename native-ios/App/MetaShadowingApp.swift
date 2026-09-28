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
            #if DEBUG
            if let root = Self.probeRoot {
                if ProcessInfo.processInfo.arguments.contains("--ui-test-learning-media") {
                    SyntheticMediaProbeView(root: root, mode: Self.mediaMode)
                } else { SyntheticLearningProbeView(root: root) }
            } else {
                LaunchGateView(bootstrap: bootstrap)
            }
            #else
            LaunchGateView(bootstrap: bootstrap)
            #endif
        }
    }

    #if DEBUG
    private static var probeRoot: URL? {
        let arguments = ProcessInfo.processInfo.arguments
        guard arguments.contains("--ui-test-learning-storage") || arguments.contains("--ui-test-learning-media") else { return nil }
        let index = arguments.firstIndex(of: "--ui-test-probe-id")
        let identifier = index.flatMap { $0 + 1 < arguments.count ? UUID(uuidString: arguments[$0 + 1]) : nil }
        return URL.applicationSupportDirectory.appending(path: "ProbeProfiles/\(identifier?.uuidString ?? "manual")")
    }
    private static var mediaMode: String {
        let arguments = ProcessInfo.processInfo.arguments
        guard let index = arguments.firstIndex(of: "--media-probe-mode"), index + 1 < arguments.count else { return "audio" }
        return arguments[index + 1]
    }
    #endif
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
