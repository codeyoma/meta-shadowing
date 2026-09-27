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
    var deferActivation = false
    var activation: CheckedContinuation<Void, Never>?
    private var generation = 0
    func requestPermission() async -> Bool {
        if deferPermission { return await withCheckedContinuation { permissionResponse = $0 } }
        return permission == .granted
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

    @Test func interruptionNeverAutoRestarts() async {
        let hardware = MonitorHardwareFixture()
        let monitor = VoiceMonitoring(hardware: hardware)
        await monitor.setEnabled(true)
        monitor.interrupted()
        monitor.update(.init(foreground: false)); monitor.update(.init())
        await waitForMonitor(monitor)
        #expect(!hardware.running)
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
}
