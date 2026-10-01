import AppFoundation
import AppleServices
import LearningDomain
import LearningPersistence
import SwiftUI

@main
struct MetaShadowingApp: App {
    @State private var profiles: ProductProfileOwner
    @State private var serviceOwner: ServiceOwner
    private var model: ProductModel { profiles.model }
    private var services: ProductServicesModel? { serviceOwner.model }
    private struct ServiceOwner { let model: ProductServicesModel? }

    init() {
        let root = Self.productRoot
        var catalog: any ProductCatalog = BundledProductCatalog(root: Bundle.main.bundleURL.appending(path: "sample"))
        let persistent = SQLiteLearningStore(root: root)
        var store: any LearningStore = persistent
        #if DEBUG
        let arguments = ProcessInfo.processInfo.arguments
        if UUID(uuidString: root.lastPathComponent) != nil,
           let index = arguments.firstIndex(of: "--ui-test-product-fixture"), index + 1 < arguments.count {
            catalog = ProductTestCatalog(root: root.appending(path: "Assets"), mode: arguments[index + 1])
            let failSave = arguments.contains("--ui-test-product-fail-save")
            let delayRevealSave = arguments.contains("--ui-test-product-delay-reveal-save")
            if failSave || delayRevealSave {
                store = ProductTestStore(root: root, failNextSave: failSave, delayRevealSave: delayRevealSave)
            }
        }
        if ProcessInfo.processInfo.arguments.contains("--ui-test-fail-first-load") {
            catalog = FailFirstProductCatalog(base: catalog)
        }
        #endif
        do {
            var values = (Bundle.main.infoDictionary ?? [:]).compactMapValues { $0 as? String }
            for key in ["FreeDuoEnabled", "NativeInternalContent"] {
                if Bundle.main.object(forInfoDictionaryKey: key) as? Bool == true { values[key] = "true" }
            }
            #if DEBUG
            // UI fixtures never inherit signed service identifiers or account access.
            if UUID(uuidString: root.lastPathComponent) != nil { values = [:] }
            #endif
            var localVideoRoot: URL?
            #if DEBUG
            if UUID(uuidString: root.lastPathComponent) == nil {
                localVideoRoot = Bundle.main.bundleURL.appending(path: "LocalVideo")
            }
            #endif
            let configuration = try ProductServiceConfiguration(values: values, sampleRoot: Bundle.main.bundleURL.appending(path: "sample"), localVideoRoot: localVideoRoot)
            var packages = configuration.packages, books = configuration.books
            var assetSource: @Sendable (HostedPackage) -> (any AssetDelivery)? = { package in
                if let local = configuration.localVideo, local.package.descriptor == package.descriptor { return local }
                return ContentDelivery.appleTransport(package)
            }
            #if DEBUG
            if UUID(uuidString: root.lastPathComponent) != nil, arguments.contains("--ui-test-services") {
                let sample = Bundle.main.bundleURL.appending(path: "sample")
                let fixture = try ServiceTestAssets.package(root: sample)
                packages = [fixture.0]; books = [fixture.1]
                assetSource = { _ in ServiceTestAssets(root: sample) }
            }
            #endif
            let delivery = try ContentDelivery(root: root.appending(path: "content"), packages: packages, transport: assetSource)
            catalog = InstalledProductCatalog(bundled: catalog, delivery: delivery, listings: books)
            let owner = ProductProfileOwner(store: store, catalog: catalog)
            var cloud: any CloudTransport = NativeCloudTransport(root: root.appending(path: "cloud-cache"))
            #if DEBUG
            if UUID(uuidString: root.lastPathComponent) != nil {
                cloud = ServiceTestCloud(available: arguments.contains("--ui-test-cloud-confirmation"))
            }
            #endif
            profiles = owner
            serviceOwner = ServiceOwner(model: ProductServicesModel(profiles: owner, store: persistent,
                delivery: delivery, transport: cloud, packages: packages))
        } catch {
            profiles = ProductProfileOwner(store: store, catalog: catalog)
            serviceOwner = ServiceOwner(model: nil)
        }
    }

    var body: some Scene {
        WindowGroup {
            #if DEBUG
            if let root = Self.downloadLabRoot {
                DeveloperDownloadLabView(root: root)
            } else if let root = Self.probeRoot {
                if ProcessInfo.processInfo.arguments.contains("--ui-test-learning-media") {
                    SyntheticMediaProbeView(root: root, mode: Self.mediaMode)
                } else { SyntheticLearningProbeView(root: root) }
            } else {
                LaunchGateView(model: model, profiles: profiles, services: services)
            }
            #else
            LaunchGateView(model: model, profiles: profiles, services: services)
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
    private static var downloadLabRoot: URL? {
        let arguments = ProcessInfo.processInfo.arguments
        guard arguments.contains("--ui-test-download-lab"), let index = arguments.firstIndex(of: "--ui-test-probe-id"),
              index + 1 < arguments.count, let id = UUID(uuidString: arguments[index + 1]) else { return nil }
        return URL.applicationSupportDirectory.appending(path: "NativeDiagnostics/\(id.uuidString)")
    }

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
