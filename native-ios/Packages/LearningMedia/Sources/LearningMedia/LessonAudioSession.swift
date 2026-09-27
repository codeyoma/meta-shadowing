public enum LessonAudioMode: Sendable { case playback, monitoring }

@MainActor public protocol AudioSessionHardware: AnyObject {
    func configure(_ mode: LessonAudioMode) throws
    func activate() throws
    func deactivate()
}

/// One owner arbitrates playback and live monitoring; transports never own the OS session.
@MainActor public final class LessonAudioSession {
    private let hardware: any AudioSessionHardware
    private var playback = false, monitoring = false, remote = false, closed = false
    public init(hardware: any AudioSessionHardware) { self.hardware = hardware }
    public func acquirePlayback() throws {
        guard !closed else { throw MediaFailure.cancelled }
        if !monitoring { try hardware.configure(.playback) }
        try hardware.activate(); playback = true
    }
    public func acquireMonitoring() throws {
        guard !closed else { throw MediaFailure.cancelled }
        try hardware.configure(.monitoring)
        try hardware.activate(); monitoring = true
    }
    public func releasePlayback() { playback = false; deactivateIfUnused() }
    public func releaseMonitoring() {
        monitoring = false
        if playback || remote { try? hardware.configure(.playback) }
        deactivateIfUnused()
    }
    public func setRemoteOwnership(_ owned: Bool) throws {
        guard !closed else { throw MediaFailure.cancelled }
        if owned && !monitoring { try hardware.configure(.playback); try hardware.activate() }
        remote = owned; deactivateIfUnused()
    }
    public func close() {
        guard !closed else { return }
        closed = true; playback = false; monitoring = false; remote = false
        hardware.deactivate()
    }
    private func deactivateIfUnused() { if !playback && !monitoring && !remote { hardware.deactivate() } }
}
