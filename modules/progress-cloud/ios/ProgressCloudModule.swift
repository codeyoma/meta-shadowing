import ExpoModulesCore
import CloudKit
import Foundation

public final class ProgressCloudModule: Module {
  private let owner = ProgressCloudOwner()

  public func definition() -> ModuleDefinition {
    let owner = owner
    // Expo's EventEmitter uses this same narrow weak-identity bridge. emit schedules
    // onto JavaScriptActor; the callback never touches this module's mutable state.
    // Remove this boundary annotation when Expo exposes a Sendable emitter handle.
    nonisolated(unsafe) weak let emitter = self
    let changed: @Sendable () -> Void = { emitter?.emit(event: "accountChanged") }
    Name("ProgressCloud")
    Events("accountChanged")
    AsyncFunction("account") { () async -> [String: String] in await owner.account() }
    AsyncFunction("list") { (scope: String) async throws -> [[String: Any]] in
      do {
        let transport = try await owner.active(scope)
        let values = try await transport.list(scope: scope)
        return values.map { ["id": $0.id, "createdAt": $0.createdAt, "revision": $0.revision] }
      } catch { throw await CloudKitService.sanitize(error) }
    }
    AsyncFunction("read") { (scope: String, id: String) async throws -> String in
      do {
        let transport = try await owner.active(scope)
        return try await transport.read(scope: scope, id: id)
      } catch { throw await CloudKitService.sanitize(error) }
    }
    AsyncFunction("publish") { (scope: String, revision: Int, json: String) async throws -> [String: Int] in
      do {
        let transport = try await owner.active(scope)
        let acknowledged = try await transport.publish(scope: scope, revision: revision, json: json)
        return ["revision": acknowledged]
      } catch { throw await CloudKitService.sanitize(error) }
    }
    AsyncFunction("stop") { () async in await owner.stop() }
    OnCreate {
      Task { await owner.observe(changed) }
    }
    OnDestroy {
      Task { await owner.destroy() }
    }
  }
}
