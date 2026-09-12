import ExpoModulesCore
import Foundation

public final class PackageStoreModule: Module {
  @MainActor private var purchases: PackagePurchases?

  public func definition() -> ModuleDefinition {
    Name("PackageStore")
    Events("onChange")
    AsyncFunction("refresh") { () async throws -> String in
      try await self.perform(.refresh)
    }
    AsyncFunction("purchase") { () async throws -> String in
      try await self.perform(.purchase)
    }
    AsyncFunction("restore") { () async throws -> String in
      try await self.perform(.restore)
    }
    OnDestroy {
      Task { @MainActor in self.purchases?.stopObserving() }
    }
  }

  private enum Action { case refresh, purchase, restore }

  @MainActor private func perform(_ action: Action) async throws -> String {
    let store: PackagePurchases
    if let purchases { store = purchases }
    else {
      // Configured at native build time. JavaScript cannot set an ownership flag.
      store = PackagePurchases(productID: Bundle.main.object(forInfoDictionaryKey: "LearningBookProductID") as? String ?? "")
      store.onChange = { [weak self] snapshot in
        guard let data = try? JSONEncoder().encode(snapshot), let json = String(data: data, encoding: .utf8) else { return }
        self?.sendEvent("onChange", ["snapshot": json])
      }
      purchases = store
    }
    switch action {
    case .refresh: await store.refresh()
    case .purchase: await store.purchase()
    case .restore: await store.restore()
    }
    return String(decoding: try JSONEncoder().encode(store.snapshot), as: UTF8.self)
  }
}
