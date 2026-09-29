import Foundation
import LearningDomain
import Observation

/// Owns the displayed workspace and the single player boundary for that workspace.
@MainActor @Observable public final class ProductProfileOwner {
    public private(set) var model: ProductModel
    public private(set) var profileID = "local"
    public private(set) var changing = false
    public private(set) var presentationID = UUID()
    private let store: any LearningStore
    private let catalog: any ProductCatalog
    @ObservationIgnored private var boundary: (UUID, @MainActor () async throws -> Void)?
    @ObservationIgnored private var generation = UUID()
    @ObservationIgnored private var prepared = false

    public init(store: any LearningStore, catalog: any ProductCatalog) {
        self.store = store; self.catalog = catalog
        model = ProductModel(workspace: ProductWorkspace(store: store, catalog: catalog, profileID: "local"))
    }
    public func registerBoundary(_ action: @escaping @MainActor () async throws -> Void) -> UUID {
        let token = UUID(); boundary = (token, action); return token
    }
    public func unregisterBoundary(_ token: UUID) {
        if boundary?.0 == token { boundary = nil }
    }
    public func prepareBoundary() async throws {
        let request = UUID(); generation = request
        changing = true
        do {
            try await boundary?.1()
            guard generation == request else { throw CancellationError() }
            await model.quiesce()
            guard generation == request else { throw CancellationError() }
            await store.revoke(profileID: profileID)
            guard generation == request else { throw CancellationError() }
            prepared = true
        } catch {
            if generation == request { changing = false }
            throw error
        }
    }
    public func selectProfile(_ profileID: String) async throws {
        guard self.profileID != profileID || prepared else { return }
        if !prepared { try await prepareBoundary() }
        self.profileID = profileID
        model = ProductModel(workspace: ProductWorkspace(store: store, catalog: catalog, profileID: profileID))
        presentationID = UUID()
        boundary = nil; prepared = false; changing = false
        await model.activate()
    }
    public func settleBoundary(resetPending: Bool) async throws {
        guard !resetPending else { return }
        if prepared { try await selectProfile(profileID) }
        changing = false
    }
}
