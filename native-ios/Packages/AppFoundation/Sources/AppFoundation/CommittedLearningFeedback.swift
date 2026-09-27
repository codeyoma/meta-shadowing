import Foundation
import LearningDomain

public struct CommittedLearningFeedback: Equatable, Sendable {
    public enum Kind: Equatable, Sendable { case cycle(Int), repeatChoice }
    public let commandID: UUID
    public let kind: Kind
    public init(commandID: UUID, kind: Kind) { self.commandID = commandID; self.kind = kind }

    static func observed(command: LearningCommand, before: LearningSession, after: LearningSession) -> Self? {
        guard before.plan.runID == after.plan.runID,
              let transition = try? LearningReducer.reduce(before, event: command.event),
              transition.session.sourceProgress == after.sourceProgress else { return nil }
        if command.event == .repeat, before.canRepeat,
           after.sourceProgress != before.sourceProgress {
            return .init(commandID: command.id, kind: .repeatChoice)
        }
        guard [.confirm, .next].contains(command.event), !transition.confirmedSources.isEmpty else { return nil }
        return .init(commandID: command.id, kind: .cycle(before.current.confirmed + 1))
    }
}
