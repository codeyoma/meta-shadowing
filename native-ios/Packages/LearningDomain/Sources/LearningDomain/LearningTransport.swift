import Foundation

public struct TransportToken: Equatable, Sendable {
    public let writerID: UUID
    public let planID: String
    public let unit: Int
    public let cycle: Int
    public let generation: UUID
    public init(writerID: UUID, planID: String, unit: Int, cycle: Int, generation: UUID) {
        self.writerID = writerID; self.planID = planID; self.unit = unit; self.cycle = cycle; self.generation = generation
    }
}
public struct TransportRequest: Equatable, Sendable {
    public let token: TransportToken
    public let intent: TransportIntent
    public init(token: TransportToken, intent: TransportIntent) { self.token = token; self.intent = intent }
}
public struct LearningCallback: Equatable, Sendable {
    public enum Event: Equatable, Sendable {
        case position(Double), playbackEnded
        public var learningEvent: LearningEvent { switch self { case let .position(seconds): .position(seconds); case .playbackEnded: .playbackEnded } }
    }
    public let token: TransportToken
    public let event: Event
    public init(token: TransportToken, event: Event) { self.token = token; self.event = event }
}
