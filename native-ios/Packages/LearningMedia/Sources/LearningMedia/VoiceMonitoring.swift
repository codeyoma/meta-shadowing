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
    public static let gainRange: ClosedRange<Float> = 0...2
    static func normalizedGain(_ value: Float) -> Float {
        value.isFinite ? min(gainRange.upperBound, max(gainRange.lowerBound, value)) : 0.25
    }
    public enum State: Sendable { case off, requesting, monitoring, suspended, blocked, denied, failed }
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
    private var interruptionActive = false
    private var enabledIntent = false, recoveryPending = false
    private var operation: Task<Void, Never>?

    public init(hardware: any VoiceMonitorHardware, defaults: UserDefaults? = nil) {
        self.hardware = hardware; self.defaults = defaults
        let value = (defaults?.object(forKey: "voice-monitor.local-gain.v1") as? NSNumber)?.floatValue ?? 0.25
        gain = Self.normalizedGain(value)
    }

    public func update(_ context: LessonInteractionContext) {
        guard !closed else { return }
        self.context = context
        if context.complete || !context.access { disable(suppress: true); return }
        let wired = hardware.outputs == [.headphones]
        if connected == true && !wired { attempted = false; suppressed = false; permissionRetry = false }
        connected = wired
        guard wired else {
            enabledIntent = false; recoveryPending = false
            disable(suppress: false); state = .blocked; return
        }
        guard !interruptionActive else { state = recoveryPending ? .suspended : .off; return }
        if recoveryPending && hardware.permission != .granted { disable(suppress: true); state = .denied; return }
        if !context.foreground || context.menuOpen {
            if state != .monitoring {
                // The initial permission sheet is the only retryable inactivity cancellation.
                if state == .requesting && hardware.permission == .undetermined && !context.menuOpen { permissionRetry = true }
                hardware.stop()
                version += 1; state = recoveryPending ? .suspended : .off
            }
            return
        }
        guard !interruptionActive, state != .monitoring, state != .requesting, !suppressed,
              (!attempted || permissionRetry || recoveryPending), hardware.permission != .denied else { return }
        permissionRetry = false
        let reservation = begin()
        operation = Task { @MainActor [weak self] in await self?.enable(reservation: reservation) }
    }

    public func routeChanged() { update(context) }
    /// Commit the button's intent synchronously, before interruption callbacks
    /// can turn a suspended OFF tap into a fresh enable request.
    public func toggle() {
        guard !closed else { return }
        if state == .monitoring || state == .suspended { disable(suppress: true); return }
        guard let reservation = reserveEnable() else { return }
        operation = Task { @MainActor [weak self] in await self?.enable(reservation: reservation) }
    }
    public func setEnabled(_ enabled: Bool) async {
        guard !closed else { return }
        if !enabled { disable(suppress: true); return }
        guard let reservation = reserveEnable() else { return }
        await enable(reservation: reservation)
    }
    private func reserveEnable() -> Int? {
        guard !interruptionActive, context.actionable, hardware.outputs == [.headphones], state != .requesting, state != .monitoring else { return nil }
        suppressed = false; permissionRetry = false; recoveryPending = false
        return begin()
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
        guard granted else { disable(suppress: true); state = .denied; return }
        guard context.actionable, hardware.outputs == [.headphones] else { state = .blocked; return }
        do {
            try await hardware.start(gain: gain)
            guard !closed, reservation == version else { return }
            enabledIntent = hardware.running; recoveryPending = false
            state = hardware.running ? .monitoring : .failed
        } catch {
            guard !closed, reservation == version else { return }
            enabledIntent = false; recoveryPending = false
            hardware.stop(); state = .failed
        }
    }
    public func interrupted() {
        guard !closed else { return }
        let recover = enabledIntent && hardware.permission == .granted && hardware.outputs == [.headphones] && context.access && !context.complete
        interruptionActive = true
        invalidation += 1; attempted = true; disable(suppress: true)
        enabledIntent = recover; recoveryPending = recover
        state = recover ? .suspended : .off
    }
    public func interruptionEnded(shouldResume: Bool) {
        guard !closed, interruptionActive else { return }
        interruptionActive = false
        guard shouldResume, enabledIntent, recoveryPending else { disable(suppress: true); return }
        suppressed = false
        update(context)
    }
    /// A graph notification can precede the audio-session interruption notification.
    /// Retain established intent, but never restart from a graph change alone.
    public func graphInvalidated() {
        guard !closed else { return }
        // An aborted recovery consumes its end-notification authorization.
        if !interruptionActive { recoveryPending = false }
        invalidation += 1; attempted = true; disable(suppress: false)
        state = recoveryPending ? .suspended : .failed
    }
    public func reset() {
        guard !closed else { return }
        interruptionActive = false; invalidation += 1; attempted = true
        disable(suppress: true)
    }
    public func setGain(_ value: Float) {
        gain = Self.normalizedGain(value)
        defaults?.set(gain, forKey: "voice-monitor.local-gain.v1")
        if state == .monitoring { hardware.setGain(gain) }
        onChange?()
    }
    private func disable(suppress: Bool) {
        version += 1; permissionRetry = false
        if suppress { suppressed = true; enabledIntent = false; recoveryPending = false }
        operation?.cancel(); operation = nil; hardware.stop(); state = .off
    }
    public func close() {
        guard !closed else { return }
        closed = true; disable(suppress: true); onChange = nil
    }
}
