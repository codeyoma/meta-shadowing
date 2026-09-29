import Foundation
import LearningDomain

public struct CommittedLearningFeedback: Equatable, Sendable {
    public enum Kind: Equatable, Sendable { case cycle(Int), repeatChoice, completion }
    public let commandID: UUID
    public let kind: Kind
    public let xpAward: Int64
    public let completedRun: Bool
    public init(commandID: UUID, kind: Kind, xpAward: Int64 = 0, completedRun: Bool = false) {
        self.commandID = commandID; self.kind = kind
        self.xpAward = xpAward; self.completedRun = completedRun
    }

    static func observed(command: LearningCommand, before snapshot: LearningSnapshot, after receipt: CommitReceipt) -> Self? {
        let before = snapshot.session, after = receipt.snapshot.session
        guard before.plan.runID == after.plan.runID,
              let transition = try? LearningReducer.reduce(before, event: command.event),
              transition.session.sourceProgress == after.sourceProgress else { return nil }
        let award = max(0, receipt.committedXP)
        let completed = transition.completed && after.phase == .complete
        func feedback(_ kind: Kind) -> Self {
            .init(commandID: command.id, kind: kind, xpAward: award, completedRun: completed)
        }
        if command.event == .repeat, before.canRepeat,
           after.sourceProgress != before.sourceProgress {
            return feedback(.repeatChoice)
        }
        guard [.confirm, .next].contains(command.event) else { return nil }
        if !transition.confirmedSources.isEmpty { return feedback(.cycle(before.current.confirmed + 1)) }
        return completed ? feedback(.completion) : nil
    }
}
