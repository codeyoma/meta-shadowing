import Foundation

public enum MonitorOutput: Sendable { case headphones, speaker, receiver, bluetooth, airplay, usb, other }
public enum MicrophonePermission: Sendable { case undetermined, denied, granted }

@MainActor public protocol VoiceMonitorHardware: AnyObject {
    var outputs: [MonitorOutput] { get }
    var permission: MicrophonePermission { get }
    var running: Bool { get }
    func requestPermission() async -> Bool
    func start(gain: Float) async throws
    func stop()
    func setGain(_ gain: Float)
}

/// Connection-scoped microphone intent, adapted from the reference monitor policy.
@MainActor public final class VoiceMonitoring {
    public enum State: Sendable { case off, requesting, monitoring, blocked, denied, failed }
    public private(set) var state: State = .off { didSet { onChange?() } }
    public private(set) var gain: Float
    public var onChange: (@MainActor () -> Void)?
    private let hardware: any VoiceMonitorHardware
    private let defaults: UserDefaults?
    private var context = LessonInteractionContext()
    private var connected: Bool?
    private var attempted = false, suppressed = false, closed = false
    private var version = 0, invalidation = 0
    private var permissionRetry = false
    private var operation: Task<Void, Never>?

    public init(hardware: any VoiceMonitorHardware, defaults: UserDefaults? = nil) {
        self.hardware = hardware; self.defaults = defaults
        let value = (defaults?.object(forKey: "voice-monitor.local-gain.v1") as? NSNumber)?.floatValue ?? 0.25
        gain = value.isFinite ? min(1, max(0, value)) : 0.25
    }

    public func update(_ context: LessonInteractionContext) {
        guard !closed else { return }
        self.context = context
        if context.complete || !context.access { disable(suppress: true); return }
        let wired = hardware.outputs == [.headphones]
        if connected == true && !wired { attempted = false; suppressed = false; permissionRetry = false }
        connected = wired
        guard wired else { disable(suppress: false); state = .blocked; return }
        if !context.foreground || context.menuOpen {
            if state != .monitoring {
                // The initial permission sheet is the only retryable inactivity cancellation.
                if state == .requesting && hardware.permission == .undetermined && !context.menuOpen { permissionRetry = true }
                version += 1; state = .off
            }
            return
        }
        guard state != .monitoring, state != .requesting, !suppressed,
              (!attempted || permissionRetry), hardware.permission != .denied else { return }
        permissionRetry = false
        let reservation = begin()
        operation = Task { @MainActor [weak self] in await self?.enable(reservation: reservation) }
    }

    public func routeChanged() { update(context) }
    public func setEnabled(_ enabled: Bool) async {
        guard !closed else { return }
        if !enabled { disable(suppress: true); return }
        guard context.actionable, hardware.outputs == [.headphones], state != .requesting, state != .monitoring else { return }
        suppressed = false; permissionRetry = false
        await enable(reservation: begin())
    }
    private func begin() -> Int {
        version += 1; attempted = true; state = .requesting
        return version
    }
    private func enable(reservation: Int) async {
        guard !closed, reservation == version, context.actionable else { return }
        let initialPermission = hardware.permission, initialInvalidation = invalidation
        let granted = await hardware.requestPermission()
        guard !closed else { return }
        guard reservation == version else {
            if granted, initialPermission == .undetermined, initialInvalidation == invalidation,
               permissionRetry, !suppressed {
                if context.actionable { update(context) }
            }
            return
        }
        guard granted else { state = .denied; return }
        guard context.actionable, hardware.outputs == [.headphones] else { state = .blocked; return }
        do {
            try await hardware.start(gain: gain)
            guard !closed, reservation == version else { return }
            state = hardware.running ? .monitoring : .failed
        } catch {
            guard !closed, reservation == version else { return }
            hardware.stop(); state = .failed
        }
    }
    public func interrupted() { invalidation += 1; attempted = true; disable(suppress: true) }
    public func setGain(_ value: Float) {
        gain = value.isFinite ? min(1, max(0, value)) : 0.25
        defaults?.set(gain, forKey: "voice-monitor.local-gain.v1")
        if state == .monitoring { hardware.setGain(gain) }
        onChange?()
    }
    private func disable(suppress: Bool) {
        version += 1; permissionRetry = false
        if suppress { suppressed = true }
        operation?.cancel(); operation = nil; hardware.stop(); state = .off
    }
    public func close() {
        guard !closed else { return }
        closed = true; disable(suppress: true); onChange = nil
    }
}
