import Testing

@MainActor
struct NetworkAvailabilityTests {
  @Test func disposalBeforeQueuedObservationCannotStartTheMonitor() {
    var starts = 0
    let monitor = ProgressNetworkAvailability(source: { _ in starts += 1; return {} })
    monitor.stop()
    monitor.observe {}
    #expect(starts == 0)
  }
  @Test func reconnectNotifiesOnceAndStopsAfterDisposal() {
    var status: (@MainActor @Sendable (Bool) -> Void)?
    var cancellations = 0
    let monitor = ProgressNetworkAvailability(source: { receive in
      status = receive
      return { cancellations += 1 }
    })
    var reconnects = 0
    monitor.observe { reconnects += 1 }
    status?(true) // Initial connectivity is handled by app startup.
    status?(true)
    #expect(reconnects == 0)
    status?(false)
    status?(false)
    status?(true)
    status?(true)
    #expect(reconnects == 1)
    monitor.stop()
    status?(false)
    status?(true)
    #expect(reconnects == 1)
    #expect(cancellations == 1)
  }
}
