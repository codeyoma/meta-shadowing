import ExpoModulesCore
import CloudKit
import Foundation

public final class ProgressCloudModule: Module {
  private let owner = ProgressCloudOwner()
  private let network = ProgressNetworkAvailability()

  public func definition() -> ModuleDefinition {
    let owner = owner
    let network = network
    // Expo's EventEmitter uses this same narrow weak-identity bridge. emit schedules
    // onto JavaScriptActor; the callback never touches this module's mutable state.
    // Remove this boundary annotation when Expo exposes a Sendable emitter handle.
    nonisolated(unsafe) weak let emitter = self
    let changed: @Sendable () -> Void = { emitter?.emit(event: "accountChanged") }
    Name("ProgressCloud")
    Events("accountChanged", "networkAvailable")
    AsyncFunction("account") { () async -> [String: String] in await owner.account() }
    AsyncFunction("list") { (scope: String) async throws -> [[String: Any]] in
      do {
        let transport = try await owner.active(scope)
        let values = try await transport.list(scope: scope)
        return values.map { value in
          var result: [String: Any] = ["id": value.id, "createdAt": value.createdAt, "revision": value.revision, "token": value.token, "legacy": value.legacy, "cleanupPending": value.cleanupPending]
          if let pending = value.pendingPublication { result["pendingPublication"] = pending }
          return result
        }
      } catch { throw await CloudKitService.sanitize(error) }
    }
    AsyncFunction("read") { (scope: String, id: String) async throws -> String in
      do {
        let transport = try await owner.active(scope)
        return try await transport.read(scope: scope, id: id)
      } catch { throw await CloudKitService.sanitize(error) }
    }
    AsyncFunction("publish") { (scope: String, revision: Int, json: String, base: String) async throws -> [String: Any] in
      do {
        let transport = try await owner.active(scope)
        let acknowledged = try await transport.publish(scope: scope, revision: revision, json: json, base: base)
        return ["id": acknowledged.id, "createdAt": acknowledged.createdAt, "revision": acknowledged.revision,
          "token": acknowledged.token, "legacy": acknowledged.legacy, "cleanupPending": acknowledged.cleanupPending]
      } catch { throw await CloudKitService.sanitize(error) }
    }
    AsyncFunction("cleanup") { (scope: String, base: String, abandoned: String?) async throws -> Bool in
      do {
        let transport = try await owner.active(scope)
        return try await transport.cleanupAdopted(scope: scope, base: base, abandoned: abandoned)
      } catch { throw await CloudKitService.sanitize(error) }
    }
    AsyncFunction("stop") { () async in await owner.stop() }
    OnCreate {
      Task { @MainActor in
        owner.observe(changed)
        network.observe { emitter?.emit(event: "networkAvailable") }
      }
    }
    OnDestroy {
      Task { @MainActor in network.stop(); await owner.destroy() }
    }
  }
}
