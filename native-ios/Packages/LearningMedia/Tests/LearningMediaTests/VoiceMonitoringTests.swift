import Foundation
import Testing
import LearningMedia

@MainActor private func waitForMonitor(_ monitor: VoiceMonitoring) async {
    let deadline = ContinuousClock.now + .seconds(1)
    while monitor.state == .requesting, ContinuousClock.now < deadline { await Task.yield() }
    #expect(monitor.state != .requesting)
}

@MainActor final class MonitorHardwareFixture: VoiceMonitorHardware {
    var outputs: [MonitorOutput] = [.headphones]
    var permission: MicrophonePermission = .granted
    var running = false
    var capturedGain: Float = 0
    var permissionResponse: CheckedContinuation<Bool, Never>?
    var deferPermission = false
    var refusePermission = false
    var deferActivation = false
    var activation: CheckedContinuation<Void, Never>?
    private var generation = 0
    func requestPermission() async -> Bool {
        if deferPermission { return await withCheckedContinuation { permissionResponse = $0 } }
        return permission == .granted && !refusePermission
    }
    func start(gain: Float) async throws {
        let current = generation
        if deferActivation { await withCheckedContinuation { activation = $0 } }
        guard current == generation else { throw MediaFailure.cancelled }
        running = true; capturedGain = gain
    }
    func stop() { generation += 1; running = false }
    func setGain(_ gain: Float) { capturedGain = gain }
}

@MainActor struct VoiceMonitoringTests {
    @Test func manualEnableCannotStartDuringInterruption() async {
        let hardware = MonitorHardwareFixture()
        let monitor = VoiceMonitoring(hardware: hardware)
        defer { monitor.close() }
        await monitor.setEnabled(true)
        monitor.interrupted()
        await monitor.setEnabled(true)
        #expect(!hardware.running)
    }
    @Test func menuOpeningCancelsPendingHardwareActivation() async throws {
        let hardware = MonitorHardwareFixture(); hardware.deferActivation = true
        let monitor = VoiceMonitoring(hardware: hardware)
        let operation = Task { await monitor.setEnabled(true) }
        try await eventually { hardware.activation != nil }
        monitor.update(.init(menuOpen: true))
        hardware.activation?.resume()
        await operation.value
        #expect(!hardware.running && monitor.state == .off)
        monitor.close()
    }
    @Test(arguments: [MonitorOutput.speaker, .bluetooth, .airplay, .usb, .receiver, .other])
    func unsupportedRouteNeverStartsCapture(_ output: MonitorOutput) async {
        let hardware = MonitorHardwareFixture(); hardware.outputs = [output]
        let monitor = VoiceMonitoring(hardware: hardware)
        monitor.update(.init()); await monitor.setEnabled(true)
        #expect(!hardware.running)
        #expect(monitor.state == .blocked)
        monitor.close()
    }

    @Test func deniedPermissionCannotStartCapture() async {
        let hardware = MonitorHardwareFixture(); hardware.permission = .denied
        let monitor = VoiceMonitoring(hardware: hardware)
        await monitor.setEnabled(true)
        #expect(!hardware.running)
        #expect(monitor.state == .denied)
        monitor.close()
    }

    @Test func interruptionDuringPermissionInvalidatesAutomaticRetry() async {
        let hardware = MonitorHardwareFixture(); hardware.permission = .undetermined; hardware.deferPermission = true
        let monitor = VoiceMonitoring(hardware: hardware)
        let start = Task { await monitor.setEnabled(true) }
        while hardware.permissionResponse == nil { await Task.yield() }
        monitor.update(.init(foreground: false)); monitor.interrupted()
        hardware.permission = .granted; hardware.deferPermission = false
        hardware.permissionResponse?.resume(returning: true)
        await start.value
        monitor.update(.init()); await waitForMonitor(monitor)
        #expect(!hardware.running)
        monitor.close()
    }

    @Test func permissionGrantAfterExitDoesNotStart() async {
        let hardware = MonitorHardwareFixture(); hardware.deferPermission = true
        let monitor = VoiceMonitoring(hardware: hardware)
        let start = Task { await monitor.setEnabled(true) }
        while hardware.permissionResponse == nil { await Task.yield() }
        monitor.close()
        hardware.permissionResponse?.resume(returning: true)
        await start.value
        #expect(!hardware.running)
        #expect(monitor.state == .off)
    }

    @Test func manualOffSurvivesForegroundUntilReconnect() async {
        let hardware = MonitorHardwareFixture()
        let monitor = VoiceMonitoring(hardware: hardware)
        await monitor.setEnabled(true)
        #expect(hardware.running)
        await monitor.setEnabled(false)
        monitor.update(.init(foreground: false))
        monitor.update(.init())
        await waitForMonitor(monitor)
        #expect(!hardware.running)
        hardware.outputs = [.speaker]; monitor.routeChanged()
        hardware.outputs = [.headphones]; monitor.routeChanged()
        await waitForMonitor(monitor)
        #expect(hardware.running)
        monitor.close()
    }

    @Test func onlyInitialPermissionCancellationMayRetryOnce() async {
        let hardware = MonitorHardwareFixture(); hardware.permission = .undetermined; hardware.deferPermission = true
        let monitor = VoiceMonitoring(hardware: hardware)
        monitor.update(.init())
        while hardware.permissionResponse == nil { await Task.yield() }
        monitor.update(.init(foreground: false))
        hardware.permission = .granted; hardware.deferPermission = false
        hardware.permissionResponse?.resume(returning: true)
        await waitForMonitor(monitor)
        #expect(!hardware.running)
        monitor.update(.init()); await waitForMonitor(monitor)
        #expect(hardware.running)
        monitor.close()
    }

    @Test func interruptionWaitsForExplicitEndBeforeManualEnable() async {
        let hardware = MonitorHardwareFixture()
        let monitor = VoiceMonitoring(hardware: hardware)
        await monitor.setEnabled(true)
        monitor.interrupted()
        monitor.update(.init(foreground: false)); monitor.update(.init())
        await waitForMonitor(monitor)
        #expect(!hardware.running)
        monitor.interruptionEnded(shouldResume: false)
        await monitor.setEnabled(true)
        #expect(hardware.running)
        monitor.close()
    }

    @Test func backgroundPreservesExistingCaptureButCannotStartIt() async {
        let hardware = MonitorHardwareFixture()
        let monitor = VoiceMonitoring(hardware: hardware)
        await monitor.setEnabled(true)
        monitor.update(.init(foreground: false, menuOpen: true))
        #expect(hardware.running)
        monitor.setGain(1)
        #expect(hardware.capturedGain == 1)
        monitor.update(.init(foreground: false, access: false))
        #expect(!hardware.running)
        await monitor.setEnabled(true)
        #expect(!hardware.running)
        monitor.close()
    }

    @Test func permittedEndRestoresPreviouslyEnabledMonitoring() async {
        let hardware = MonitorHardwareFixture()
        let monitor = VoiceMonitoring(hardware: hardware)
        defer { monitor.close() }
        await monitor.setEnabled(true)
        monitor.setGain(0.6)
        monitor.interrupted()
        #expect(!hardware.running && monitor.state == .suspended)
        monitor.update(.init()); await waitForMonitor(monitor)
        #expect(!hardware.running)
        monitor.interruptionEnded(shouldResume: true); await waitForMonitor(monitor)
        #expect(hardware.running && monitor.state == .monitoring)
        #expect(hardware.capturedGain == 0.6)
    }

    @Test func permittedEndWaitsForForegroundAndMenuDismissal() async {
        let hardware = MonitorHardwareFixture()
        let monitor = VoiceMonitoring(hardware: hardware)
        defer { monitor.close() }
        await monitor.setEnabled(true)
        monitor.update(.init(foreground: false))
        monitor.interrupted()
        monitor.interruptionEnded(shouldResume: true); await waitForMonitor(monitor)
        #expect(!hardware.running && monitor.state == .suspended)
        monitor.update(.init(menuOpen: true)); await waitForMonitor(monitor)
        #expect(!hardware.running)
        monitor.update(.init()); await waitForMonitor(monitor)
        #expect(hardware.running)
    }

    @Test(arguments: [true, false])
    func manualOffCancelsRecovery(_ beforeEnd: Bool) async {
        let hardware = MonitorHardwareFixture()
        let monitor = VoiceMonitoring(hardware: hardware)
        defer { monitor.close() }
        await monitor.setEnabled(true)
        monitor.update(.init(foreground: false)); monitor.interrupted()
        if beforeEnd { await monitor.setEnabled(false) }
        monitor.interruptionEnded(shouldResume: true)
        if !beforeEnd { await monitor.setEnabled(false) }
        monitor.update(.init()); await waitForMonitor(monitor)
        #expect(!hardware.running && monitor.state == .off)
    }

    @Test func unplugDuringInterruptionCancelsRecoveryEvenAfterReconnect() async {
        let hardware = MonitorHardwareFixture()
        let monitor = VoiceMonitoring(hardware: hardware)
        defer { monitor.close() }
        await monitor.setEnabled(true)
        monitor.interrupted()
        hardware.outputs = [.speaker]; monitor.routeChanged()
        hardware.outputs = [.headphones]; monitor.routeChanged()
        monitor.interruptionEnded(shouldResume: true); await waitForMonitor(monitor)
        #expect(!hardware.running)
    }

    @Test(arguments: [LessonInteractionContext(access: false), .init(complete: true)])
    func lostEligibilityCancelsRecovery(_ context: LessonInteractionContext) async {
        let hardware = MonitorHardwareFixture()
        let monitor = VoiceMonitoring(hardware: hardware)
        defer { monitor.close() }
        await monitor.setEnabled(true)
        monitor.interrupted(); monitor.update(context)
        monitor.interruptionEnded(shouldResume: true)
        monitor.update(.init()); await waitForMonitor(monitor)
        #expect(!hardware.running)
    }

    @Test func interruptedPermissionRequestCannotBecomeRecoveryIntent() async {
        let hardware = MonitorHardwareFixture(); hardware.permission = .undetermined; hardware.deferPermission = true
        let monitor = VoiceMonitoring(hardware: hardware)
        defer { monitor.close() }
        let operation = Task { await monitor.setEnabled(true) }
        while hardware.permissionResponse == nil { await Task.yield() }
        monitor.interrupted()
        hardware.permission = .granted; hardware.deferPermission = false
        hardware.permissionResponse?.resume(returning: true)
        await operation.value
        monitor.interruptionEnded(shouldResume: true); await waitForMonitor(monitor)
        #expect(!hardware.running)
    }

    @Test func graphInvalidationBeforeInterruptionPreservesPreviouslyEnabledIntent() async {
        let hardware = MonitorHardwareFixture()
        let monitor = VoiceMonitoring(hardware: hardware)
        defer { monitor.close() }
        await monitor.setEnabled(true)
        monitor.graphInvalidated()
        #expect(!hardware.running)
        monitor.interrupted(); monitor.interruptionEnded(shouldResume: true)
        await waitForMonitor(monitor)
        #expect(hardware.running)
    }

    @Test func graphInvalidationDuringRecoveryRequiresManualRestart() async throws {
        let hardware = MonitorHardwareFixture()
        let monitor = VoiceMonitoring(hardware: hardware)
        defer { monitor.close() }
        await monitor.setEnabled(true)
        monitor.interrupted()
        hardware.deferActivation = true
        monitor.interruptionEnded(shouldResume: true)
        try await eventually { hardware.activation != nil }

        monitor.graphInvalidated()
        hardware.deferActivation = false
        let retiredActivation = hardware.activation
        hardware.activation = nil
        retiredActivation?.resume()
        monitor.update(.init(menuOpen: true))
        monitor.update(.init())
        await waitForMonitor(monitor)
        #expect(monitor.state != .monitoring)
        #expect(!hardware.running)

        await monitor.setEnabled(true)
        #expect(monitor.state == .monitoring && hardware.running)
    }

    @Test func graphInvalidationDuringInterruptionPreservesWaitingRecovery() async {
        let hardware = MonitorHardwareFixture()
        let monitor = VoiceMonitoring(hardware: hardware)
        defer { monitor.close() }
        await monitor.setEnabled(true)
        monitor.interrupted()
        monitor.graphInvalidated()
        #expect(monitor.state == .suspended && !hardware.running)
        monitor.interruptionEnded(shouldResume: true)
        await waitForMonitor(monitor)
        #expect(monitor.state == .monitoring && hardware.running)
    }

    @Test func mediaResetCancelsPendingRecoveryButAllowsManualEnable() async {
        let hardware = MonitorHardwareFixture()
        let monitor = VoiceMonitoring(hardware: hardware)
        defer { monitor.close() }
        await monitor.setEnabled(true)
        monitor.interrupted(); monitor.reset()
        monitor.interruptionEnded(shouldResume: true); await waitForMonitor(monitor)
        #expect(!hardware.running)
        await monitor.setEnabled(true)
        #expect(hardware.running)
    }

    @Test func disallowedEndRequiresManualEnable() async {
        let hardware = MonitorHardwareFixture()
        let monitor = VoiceMonitoring(hardware: hardware)
        defer { monitor.close() }
        await monitor.setEnabled(true)
        monitor.interrupted(); monitor.interruptionEnded(shouldResume: false)
        monitor.update(.init()); await waitForMonitor(monitor)
        #expect(!hardware.running)
        await monitor.setEnabled(true)
        #expect(hardware.running)
    }

    @Test func permissionRefusalCancelsRecovery() async {
        let hardware = MonitorHardwareFixture()
        let monitor = VoiceMonitoring(hardware: hardware)
        defer { monitor.close() }
        await monitor.setEnabled(true)
        monitor.interrupted(); hardware.refusePermission = true
        monitor.interruptionEnded(shouldResume: true); await waitForMonitor(monitor)
        #expect(monitor.state == .denied && !hardware.running)
        hardware.refusePermission = false
        monitor.update(.init()); await waitForMonitor(monitor)
        #expect(monitor.state == .denied && !hardware.running)
    }

    @Test func lateRecoveryActivationCannotRestartAfterManualOff() async throws {
        let hardware = MonitorHardwareFixture()
        let monitor = VoiceMonitoring(hardware: hardware)
        defer { monitor.close() }
        await monitor.setEnabled(true)
        monitor.interrupted(); hardware.deferActivation = true
        monitor.interruptionEnded(shouldResume: true)
        try await eventually { hardware.activation != nil }
        await monitor.setEnabled(false)
        hardware.activation?.resume()
        monitor.update(.init()); await waitForMonitor(monitor)
        #expect(monitor.state == .off && !hardware.running)
    }

    @Test func lateInterruptionEndCannotRestartClosedMonitor() async {
        let hardware = MonitorHardwareFixture()
        let monitor = VoiceMonitoring(hardware: hardware)
        await monitor.setEnabled(true)
        monitor.interrupted(); monitor.close()
        monitor.interruptionEnded(shouldResume: true)
        monitor.update(.init()); await waitForMonitor(monitor)
        #expect(monitor.state == .off && !hardware.running)
    }

    @Test func suspendedOffTapCannotBecomeEnableWhenInterruptionEndsBeforeTaskRuns() async {
        let hardware = MonitorHardwareFixture()
        let monitor = VoiceMonitoring(hardware: hardware)
        defer { monitor.close() }
        await monitor.setEnabled(true)
        monitor.interrupted()
        monitor.toggle()
        monitor.interruptionEnded(shouldResume: true)
        await Task.yield(); await waitForMonitor(monitor)
        #expect(monitor.state == .off && !hardware.running)
    }
}
