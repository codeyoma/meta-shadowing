import Foundation
import XCTest
import Testing

@MainActor
private final class MonitorHardwareStub: VoiceMonitorHardware {
  var outputs: [MonitorOutput] = [.headphones]
  var inputs: [MonitorInput] = [.headset]
  var active = false
  var starts = 0
  var permissionRequests = 0
  var immediatePermission: Bool?
  var permission: CheckedContinuation<Bool, Never>?
  var failStart = false
  var onStart: (() -> Void)?
  var gain: Float = 0
  func requestPermission() async -> Bool {
    permissionRequests += 1
    if let immediatePermission { return immediatePermission }
    return await withCheckedContinuation { permission = $0 }
  }
  func start(gain: Float) throws {
    starts += 1
    active = true
    self.gain = gain
    onStart?()
    if failStart { throw NSError(domain: "fixture", code: 1) }
  }
  func stop() { active = false }
  func setGain(_ gain: Float) { self.gain = gain }
}

final class VoiceMonitorTests: XCTestCase {
  @MainActor
  func testLearningMonitoringCanStartInEveryBuildConfiguration() async {
    let hardware = MonitorHardwareStub()
    hardware.immediatePermission = true
    let controller = VoiceMonitorController(hardware: hardware, allowed: VoiceMonitorPolicy.monitoringSupported)
    await controller.enable()
    XCTAssertEqual(hardware.permissionRequests, 1)
    XCTAssertTrue(hardware.active)
    XCTAssertEqual(controller.state, .monitoring)
  }

  func testOnlyOneIdentifiableHeadphoneOutputIsAllowed() {
    XCTAssertTrue(VoiceMonitorPolicy.allows([.headphones]))
    for output in [MonitorOutput.speaker, .receiver, .bluetooth, .airplay, .usb, .other] {
      XCTAssertFalse(VoiceMonitorPolicy.allows([output]))
      XCTAssertFalse(VoiceMonitorPolicy.allows([.headphones, output]))
    }
    XCTAssertFalse(VoiceMonitorPolicy.allows([]))
    XCTAssertFalse(VoiceMonitorPolicy.allows([.headphones, .headphones]))
    XCTAssertEqual(VoiceMonitorPolicy.preferredInput([.builtIn, .headset]), .headset)
    XCTAssertEqual(VoiceMonitorPolicy.preferredInput([.builtIn]), .builtIn)
    XCTAssertNil(VoiceMonitorPolicy.preferredInput([.usb, .other]))
  }

  @MainActor
  func testQueuedBridgeEnableCannotRunAfterDisable() async {
    let hardware = MonitorHardwareStub()
    let controller = VoiceMonitorController(hardware: hardware, allowed: true)
    let queued = controller.queuedEnable()
    controller.disable()
    await queued()
    XCTAssertEqual(hardware.permissionRequests, 0)
    XCTAssertFalse(hardware.active)
    XCTAssertEqual(controller.state, .off)
  }

  @MainActor
  func testDestroyedLifetimeRejectsQueuedAndFreshRequests() async {
    let lifetime = MonitorLifetime()
    let hardware = MonitorHardwareStub()
    let controller = VoiceMonitorController(hardware: hardware, allowed: true, lifetime: lifetime)
    let queued = controller.queuedEnable()
    lifetime.close()
    await queued()
    await controller.enable()
    XCTAssertFalse(lifetime.isOpen)
    XCTAssertEqual(hardware.permissionRequests, 0)
    XCTAssertFalse(hardware.active)
  }

  @MainActor
  func testUnsupportedCapabilityOrRouteNeverRequestsPermissionOrStarts() async {
    for allowed in [false, true] {
      let hardware = MonitorHardwareStub()
      if allowed { hardware.outputs = [.usb] }
      let controller = VoiceMonitorController(hardware: hardware, allowed: allowed)
      await controller.enable()
      XCTAssertEqual(controller.state, .blocked)
      XCTAssertEqual(hardware.permissionRequests, 0)
      XCTAssertFalse(hardware.active)
    }
  }

  @MainActor
  func testDisableInvalidateAndUnplugDiscardLatePermission() async {
    for action in 0...2 {
      let hardware = MonitorHardwareStub()
      let controller = VoiceMonitorController(hardware: hardware, allowed: true)
      let enable = Task { await controller.enable() }
      while hardware.permission == nil { await Task.yield() }
      if action == 0 { controller.disable() }
      if action == 1 { controller.invalidate() }
      if action == 2 { hardware.outputs = [.speaker] }
      hardware.permission?.resume(returning: true)
      await enable.value
      XCTAssertEqual(hardware.starts, 0)
      XCTAssertFalse(hardware.active)
      XCTAssertNotEqual(controller.state, .monitoring)
    }
  }

  @MainActor
  func testDeniedPermissionAndPartialStartFailureStayStopped() async {
    for granted in [false, true] {
      let hardware = MonitorHardwareStub()
      hardware.failStart = granted
      let controller = VoiceMonitorController(hardware: hardware, allowed: true)
      let enable = Task { await controller.enable() }
      while hardware.permission == nil { await Task.yield() }
      hardware.permission?.resume(returning: granted)
      await enable.value
      XCTAssertEqual(controller.state, granted ? .failed : .denied)
      XCTAssertFalse(hardware.active)
    }
  }

  @MainActor
  func testRepeatedEnableAndRouteChangeDuringStartCannotLeaveGraphRunning() async {
    let hardware = MonitorHardwareStub()
    let controller = VoiceMonitorController(hardware: hardware, allowed: true)
    let enable = Task { await controller.enable() }
    while hardware.permission == nil { await Task.yield() }
    await controller.enable()
    XCTAssertEqual(hardware.permissionRequests, 1)
    hardware.onStart = { hardware.outputs = [.speaker] }
    hardware.permission?.resume(returning: true)
    await enable.value
    XCTAssertEqual(controller.state, .blocked)
    XCTAssertFalse(hardware.active)
  }

  @MainActor
  func testSuccessfulEnableAndGainPersistenceNeverPersistIntent() async {
    let suite = "voice-monitor-test-\(UUID().uuidString)"
    let defaults = UserDefaults(suiteName: suite)!
    defer { defaults.removePersistentDomain(forName: suite) }
    let hardware = MonitorHardwareStub()
    let controller = VoiceMonitorController(hardware: hardware, allowed: true, defaults: defaults)
    XCTAssertEqual(controller.gain, 0.25)
    for (input, expected) in [(Float.nan, Float(0.25)), (.infinity, 0.25), (-1, 0), (2, 1), (0.4, 0.4)] {
      controller.setGain(input)
      XCTAssertEqual(controller.gain, expected)
    }
    let enable = Task { await controller.enable() }
    while hardware.permission == nil { await Task.yield() }
    hardware.permission?.resume(returning: true)
    await enable.value
    XCTAssertTrue(hardware.active)
    XCTAssertEqual(hardware.gain, 0.4)
    XCTAssertEqual(controller.state, .monitoring)
    controller.invalidate()
    XCTAssertFalse(hardware.active)
    let next = VoiceMonitorController(hardware: hardware, allowed: true, defaults: defaults)
    XCTAssertEqual(next.state, .off)
    XCTAssertEqual(next.gain, 0.4)
    defaults.set("corrupt", forKey: VoiceMonitorController.gainKey)
    XCTAssertEqual(VoiceMonitorController(hardware: hardware, allowed: true, defaults: defaults).gain, 0.25)
  }
}

struct MonitorBackgroundTests {
  @Test @MainActor func lessonPreparationCannotReplaceLiveOrPendingMicrophoneSession() async {
    let hardware = MonitorHardwareStub()
    let controller = VoiceMonitorController(hardware: hardware, allowed: true)
    var configurations = 0
    controller.configurePlayback { configurations += 1 }
    #expect(configurations == 1)
    let enable = Task { await controller.enable() }
    while hardware.permission == nil { await Task.yield() }
    controller.configurePlayback { configurations += 1 }
    #expect(configurations == 1)
    hardware.permission?.resume(returning: true)
    await enable.value
    controller.configurePlayback { configurations += 1 }
    #expect(configurations == 1)
    #expect(hardware.active)
    controller.disable()
    controller.configurePlayback { configurations += 1 }
    #expect(configurations == 2)
    #expect(!hardware.active)
  }
  @Test @MainActor func inactivityKeepsEnabledMonitoringButExplicitStopStillStops() async {
    let hardware = MonitorHardwareStub()
    let controller = VoiceMonitorController(hardware: hardware, allowed: true)
    let enable = Task { await controller.enable() }
    while hardware.permission == nil { await Task.yield() }
    hardware.permission?.resume(returning: true)
    await enable.value
    controller.applicationBecameInactive()
    #expect(hardware.active)
    #expect(controller.state == .monitoring)
    controller.disable()
    #expect(!hardware.active)
    #expect(controller.state == .off)
  }

  @Test @MainActor func inactivityCancelsPendingAndQueuedEnablesWithoutRestarting() async {
    let hardware = MonitorHardwareStub()
    let controller = VoiceMonitorController(hardware: hardware, allowed: true)
    let queued = controller.queuedEnable()
    controller.applicationBecameInactive()
    await queued()
    #expect(hardware.permissionRequests == 0)
    let enable = Task { await controller.enable() }
    while hardware.permission == nil { await Task.yield() }
    controller.applicationBecameInactive()
    hardware.permission?.resume(returning: true)
    await enable.value
    #expect(hardware.starts == 0)
    #expect(controller.state == .off)
  }
}
