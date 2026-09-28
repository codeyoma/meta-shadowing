import Foundation
import LearningDomain

public struct PreparedMediaRequest: Equatable, Sendable {
    public let token: TransportToken
    public let sources: [MediaSource]
    public let positionSeconds: Double
    public let rate: Double
    public init(token: TransportToken, sources: [MediaSource], positionSeconds: Double, rate: Double) {
        self.token = token; self.sources = sources; self.positionSeconds = positionSeconds; self.rate = rate
    }
}

public struct MediaPosition: Equatable, Sendable {
    public let seconds: Double
    public let duration: Double
    public init(seconds: Double, duration: Double) { self.seconds = seconds; self.duration = duration }
}

public struct MediaTransportEvent: Equatable, Sendable {
    public enum Kind: Equatable, Sendable {
        case position(MediaPosition), memberBoundary(MediaPosition), ended(MediaPosition), interrupted(MediaPosition), failed(MediaFailure)
    }
    public let token: TransportToken
    public let kind: Kind
    public init(token: TransportToken, kind: Kind) { self.token = token; self.kind = kind }
}

@MainActor public protocol MediaTransport: AnyObject {
    var onEvent: (@MainActor (MediaTransportEvent) -> Void)? { get set }
    func prepare(_ request: PreparedMediaRequest) async throws
    func play(token: TransportToken) throws
    @discardableResult func pause() -> MediaPosition?
    func dispose()
}
