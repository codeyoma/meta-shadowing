import AppFoundation
import LearningDomain
import LearningPersistence
import SwiftUI

@main
struct MetaShadowingApp: App {
    @State private var model: ProductModel

    init() {
        let root = Self.productRoot
        var catalog: any ProductCatalog = BundledProductCatalog(root: Bundle.main.bundleURL.appending(path: "sample"))
        #if DEBUG
        if ProcessInfo.processInfo.arguments.contains("--ui-test-fail-first-load") {
            catalog = FailFirstProductCatalog(base: catalog)
        }
        #endif
        model = ProductModel(workspace: ProductWorkspace(store: SQLiteLearningStore(root: root),
            catalog: catalog, profileID: "local"))
    }

    var body: some Scene {
        WindowGroup {
            #if DEBUG
            if let root = Self.probeRoot {
                if ProcessInfo.processInfo.arguments.contains("--ui-test-learning-media") {
                    SyntheticMediaProbeView(root: root, mode: Self.mediaMode)
                } else { SyntheticLearningProbeView(root: root) }
            } else {
                LaunchGateView(model: model)
            }
            #else
            LaunchGateView(model: model)
            #endif
        }
    }

    private static var productRoot: URL {
        #if DEBUG
        let arguments = ProcessInfo.processInfo.arguments
        if arguments.contains("--ui-test-product"), let index = arguments.firstIndex(of: "--ui-test-probe-id"),
           index + 1 < arguments.count, let id = UUID(uuidString: arguments[index + 1]) {
            return URL.applicationSupportDirectory.appending(path: "ProductTestProfiles/\(id.uuidString)")
        }
        #endif
        return URL.applicationSupportDirectory.appending(path: "SwiftNativeProduct/v1")
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
private actor FailFirstProductCatalog: ProductCatalog {
    let base: any ProductCatalog
    private var failed = false

    init(base: any ProductCatalog) { self.base = base }

    func books() async throws -> [CatalogBook] {
        if !failed {
            failed = true
            throw CocoaError(.fileReadUnknown)
        }
        return try await base.books()
    }
    func materials(packageKey: String) async throws -> BookMaterials { try await base.materials(packageKey: packageKey) }
    func permitsPractice(packageKey: String) async -> Bool { await base.permitsPractice(packageKey: packageKey) }
}
#endif
