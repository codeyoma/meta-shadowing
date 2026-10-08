#if os(iOS)
import AppFoundation
import LearningDomain
import Observation
import UIKit

/// One mounted lesson owns all OS resources. Call close before replacing its writer.
@MainActor @Observable public final class NativeLearningRuntime {
    public private(set) var state: LearningMediaState
    public private(set) var controls: LearningControlPresentation
    public let motion = LearningMotionState()
    public private(set) var monitorState: VoiceMonitoring.State = .off
    public private(set) var monitorGain: Float = 0.25
    public private(set) var feedbackCount = 0
    public private(set) var feedback: CommittedLearningFeedback?
    public let coordinator: LearningMediaCoordinator
    public let monitoring: VoiceMonitoring
    @ObservationIgnored private let session: LessonAudioSession
    @ObservationIgnored private let graph: VoiceMonitorEngine
    @ObservationIgnored private let remote: LessonRemoteControl
    @ObservationIgnored private let haptics = NativeHapticPlayer()
    @ObservationIgnored private var lifecycle: LessonLifecycleObserver?
    @ObservationIgnored private var context: LessonInteractionContext
    @ObservationIgnored private var closed = false

    public init(controller: LearningController, initial: LearningControllerState, catalog: MediaAssetCatalog,
                authorize: @escaping @Sendable (LearningScope) async -> Bool,
                makeTransport: @escaping @MainActor ([MediaSource]) -> any MediaTransport,
                initiallyPresented: Bool = true, monitorHardware: (any VoiceMonitorHardware)? = nil) {
        session = LessonAudioSession()
        graph = VoiceMonitorEngine(session: session)
        monitoring = VoiceMonitoring(hardware: monitorHardware ?? graph, defaults: .standard)
        remote = LessonRemoteControl(session: session)
        coordinator = LearningMediaCoordinator(controller: controller, initial: initial, catalog: catalog,
            authorize: authorize, makeTransport: makeTransport, audioSession: session)
        state = coordinator.state
        controls = LearningControlPresentation(state: coordinator.state, gate: coordinator.remoteState)
        motion.update(coordinator.state)
        context = .init(foreground: UIApplication.shared.applicationState == .active,
                        menuOpen: !initiallyPresented, complete: initial.snapshot.session.phase == .complete)
        coordinator.onChange = { [weak self] in self?.updated($0) }
        coordinator.onFeedback = { [weak self] event in
            guard let self, !self.closed else { return }
            self.feedbackCount += 1
            if event.xpAward > 0 || event.completedRun { self.feedback = event }
            switch event.kind {
            case let .cycle(cycle): if let pattern = HapticPattern.cycle(cycle) { self.haptics.play(pattern) }
            case .repeatChoice: self.haptics.play(.repeatChoice)
            case .completion: break // Completion does not add another cycle haptic.
            }
        }
        monitoring.onChange = { [weak self] in
            guard let self else { return }
            self.monitorState = self.monitoring.state; self.monitorGain = self.monitoring.gain
        }
        graph.onInvalidation = { [weak self] in self?.monitoring.graphInvalidated() }
        remote.onPress = { [weak self] event in Task { @MainActor in
            guard let self, !self.closed else { return }; _ = await self.coordinator.receiveRemote(event)
        } }
        lifecycle = LessonLifecycleObserver { [weak self] in self?.handle($0) }
        Task { @MainActor [weak self] in
            guard let self, !self.closed, !self.context.complete else { return }
            try? await self.remote.begin(self.coordinator.remoteState.owner)
            if !self.closed { self.refreshRemote() }
        }
        applyContext()
    }
    public func setMenuOpen(_ open: Bool) { if open { feedback = nil }; context.menuOpen = open; applyContext() }
    public func setAccess(_ access: Bool) { if !access { feedback = nil }; context.access = access; applyContext() }
    public func suspend() { feedback = nil; coordinator.suspend(.inactivity); haptics.stop() }
    public func close() async {
        guard !closed else { return }
        closed = true; feedback = nil; lifecycle?.close(); lifecycle = nil
        monitoring.close(); graph.close(); remote.close(); haptics.stop()
        await coordinator.close()
    }
    private func updated(_ state: LearningMediaState) {
        self.state = state
        controls = LearningControlPresentation(state: state, gate: coordinator.remoteState)
        motion.update(state)
        let complete = state.controller.snapshot.session.phase == .complete
        if complete != context.complete { context.complete = complete; applyContext() }
        refreshRemote()
    }
    private func applyContext() {
        guard !closed else { return }
        coordinator.setContext(context); monitoring.update(context); refreshRemote()
        if context.complete { remote.close() }
        if !context.actionable { haptics.stop() }
    }
    private func refreshRemote() {
        let gate = coordinator.remoteState
        remote.update(owner: gate.owner, revision: gate.revision, actionable: gate.mainAction != nil,
            repeatable: gate.repeatable, playing: gate.playing)
    }
    private func handle(_ event: LessonLifecycleEvent) {
        guard !closed else { return }
        switch event {
        case .active: context.foreground = true; applyContext()
        case .inactive: feedback = nil; context.foreground = false; applyContext()
        case .routeChanged: feedback = nil; coordinator.suspend(.routeChange); monitoring.routeChanged(); haptics.stop()
        case let .interruptionEnded(shouldResume):
            monitoring.interruptionEnded(shouldResume: shouldResume)
        case .interrupted:
            feedback = nil
            session.invalidate()
            coordinator.suspend(.interruption); monitoring.interrupted(); haptics.stop()
        case .reset:
            feedback = nil
            session.invalidate()
            coordinator.suspend(.interruption); monitoring.reset(); haptics.stop()
        }
    }
}
#endif
