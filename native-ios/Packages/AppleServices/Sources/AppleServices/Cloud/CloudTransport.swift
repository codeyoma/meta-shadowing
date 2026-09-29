import Foundation

public enum CloudAccount: Equatable, Sendable {
    case available(String), noAccount, unavailable, unknown
    public var scope: String? { if case .available(let scope) = self { scope } else { nil } }
}

public protocol CloudTransport: Sendable {
    func account() async -> CloudAccount
    func accountChanges() async -> AsyncStream<Void>
    func list(scope: String) async throws -> [CloudBackup]
    func read(scope: String, id: String) async throws -> Data
    func publish(scope: String, revision: Int64, payload: Data, base: String) async throws -> CloudPublication
    func reset(scope: String, requestID: UUID, expectedGeneration: String?, payload: Data) async throws -> CloudPublication
    func cleanupAdopted(scope: String, base: String, abandoned: String?) async throws -> Bool
    func discardLocal(scope: String) async throws
    func stop() async
}

@CloudActor public final class NativeCloudTransport: CloudTransport {
    private let owner: ProgressCloudOwner
    private let accountLookup: (@CloudActor @Sendable () async -> CloudAccount)?
    private var accountListeners: [UUID: AsyncStream<Void>.Continuation] = [:]
    public nonisolated init(root: URL) {
        owner = ProgressCloudOwner(root: root)
        accountLookup = nil
    }
    init(owner: ProgressCloudOwner, account: @escaping @CloudActor @Sendable () async -> CloudAccount) {
        self.owner = owner; accountLookup = account
    }
    public func account() async -> CloudAccount {
        if let accountLookup { return await accountLookup() }
        let result = await owner.account()
        switch result["status"] {
        case "available": return result["scope"].map(CloudAccount.available) ?? .unknown
        case "no-account": return .noAccount
        case "unavailable": return .unavailable
        default: return .unknown
        }
    }
    public func accountChanges() -> AsyncStream<Void> {
        let id = UUID()
        let (stream, continuation) = AsyncStream<Void>.makeStream(bufferingPolicy: .bufferingNewest(1))
        accountListeners[id] = continuation
        owner.observe { [weak self] in
            guard let self else { return }
            for listener in self.accountListeners.values { listener.yield(()) }
        }
        continuation.onTermination = { [weak self] _ in Task { @CloudActor in self?.removeAccountListener(id) } }
        return stream
    }
    private func removeAccountListener(_ id: UUID) {
        accountListeners[id] = nil
        if accountListeners.isEmpty { owner.stopObserving() }
    }
    public func list(scope: String) async throws -> [CloudBackup] { try await owner.active(scope).list(scope: scope) }
    public func read(scope: String, id: String) async throws -> Data { try await Data(owner.active(scope).read(scope: scope, id: id).utf8) }
    public func publish(scope: String, revision: Int64, payload: Data, base: String) async throws -> CloudPublication {
        guard let revision = Int(exactly: revision), let json = String(data: payload, encoding: .utf8) else { throw ProgressCloudError.corrupt }
        return try await owner.active(scope).publish(scope: scope, revision: revision, json: json, base: base)
    }
    public func reset(scope: String, requestID: UUID, expectedGeneration: String?, payload: Data) async throws -> CloudPublication {
        guard let json = String(data: payload, encoding: .utf8) else { throw ProgressCloudError.corrupt }
        return try await owner.active(scope).reset(scope: scope, requestId: requestID.uuidString.lowercased(), expectedGeneration: expectedGeneration ?? "", json: json)
    }
    public func cleanupAdopted(scope: String, base: String, abandoned: String?) async throws -> Bool {
        try await owner.active(scope).cleanupAdopted(scope: scope, base: base, abandoned: abandoned)
    }
    public func discardLocal(scope: String) async throws { try await owner.discardLocal(scope) }
    public func stop() async { await owner.stop() }
}
