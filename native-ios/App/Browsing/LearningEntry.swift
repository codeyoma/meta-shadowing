import AppFoundation
import Foundation
import Observation

@MainActor @Observable final class LearningEntry {
    struct Route: Identifiable {
        let id = UUID()
        let packageKey: String
        let stage: Int
        let flow: LearningFlow
    }
    var route: Route?
    private(set) var preparing = false
    var failed = false
    @ObservationIgnored private var candidate: Route?
    @ObservationIgnored private var presented: Route?
    @ObservationIgnored private var pending: Task<Void, Never>?
    @ObservationIgnored private var retiring: Task<Void, Never>?
    @ObservationIgnored private var boundary: (ProductProfileOwner, UUID)?

    func prepare(packageKey: String, stage: Int, model: ProductModel, profiles: ProductProfileOwner? = nil) {
        guard !preparing, presented == nil, !model.busy, profiles?.changing != true else { return }
        let next = Route(packageKey: packageKey, stage: stage, flow: LearningFlow(workspace: model.workspace))
        candidate = next; preparing = true; failed = false
        if let profiles {
            let requestID = next.id
            let token = profiles.registerBoundary { [weak self, weak flow = next.flow] in
                try await flow?.prepareServiceBoundary()
                if self?.candidate?.id == requestID { self?.cancelPreparation() }
            }
            boundary = (profiles, token)
        }
        let previous = retiring
        pending = Task { [weak self] in
            await previous?.value
            guard !Task.isCancelled, self?.candidate?.id == next.id else { return }
            await next.flow.open(packageKey: packageKey, stage: stage, startWhenPresented: true)
            guard let self, self.candidate?.id == next.id, !Task.isCancelled else {
                await next.flow.close()
                return
            }
            guard profiles?.changing != true, profiles == nil || profiles?.model === model,
                  !next.flow.closedByService else {
                self.cancelPreparation()
                return
            }
            guard !next.flow.failed, !next.flow.accessInvalidated,
                  next.flow.runtime?.state.controller.active == true,
                  next.flow.runtime?.controls.saveFailed == false else {
                self.cancelPreparation()
                self.failed = true
                return
            }
            self.presented = next
            self.route = next
            self.pending = nil; self.preparing = false
        }
    }

    func didPresent(_ id: UUID) {
        if candidate?.id == id, route?.id == id { candidate = nil }
    }

    func cancelPreparation() {
        guard let candidate else { return }
        self.candidate = nil; preparing = false; failed = false
        pending?.cancel(); pending = nil
        if route?.id == candidate.id { route = nil }
        if presented?.id == candidate.id { presented = nil }
        unregisterBoundary()
        retire(candidate.flow)
    }

    func didDismiss(_ id: UUID) {
        guard let dismissed = presented, dismissed.id == id else { return }
        cancelPreparation()
        // SwiftUI can finish an older dismissal after another route was prepared.
        // Only the disappearing player's identity may release its display owner.
        route = nil
        presented = nil
        unregisterBoundary()
        retire(dismissed.flow)
    }

    private func unregisterBoundary() {
        if let (profiles, token) = boundary { profiles.unregisterBoundary(token) }
        boundary = nil
    }

    private func retire(_ flow: LearningFlow) {
        let previous = retiring
        retiring = Task {
            await previous?.value
            await flow.close()
        }
    }
}
