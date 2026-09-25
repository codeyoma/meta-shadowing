import Testing
import UIKit

@MainActor
struct SystemMenuTouchGateTests {
  @Test func menuGateCannotPreventNativeSheetGestures() throws {
    let scene = try #require(UIApplication.shared.connectedScenes.first as? UIWindowScene)
    let window = UIWindow(windowScene: scene)
    let gate = SystemMenuTouchGate()
    window.addGestureRecognizer(gate)
    let drawer = UIView()
    drawer.accessibilityViewIsModal = true
    window.addSubview(drawer)

    #expect(!gate.canPrevent(UIPanGestureRecognizer()))
  }

  @Test func otherGesturesCannotPreventMenuTouchFiltering() {
    let gate = SystemMenuTouchGate()
    #expect(!gate.canBePrevented(by: UIPanGestureRecognizer()))
  }

  @Test func menuDetectionStillRequiresAnActiveContextMenu() {
    #expect(SystemMenuTouchGate.isOpenContextMenuContainer(
      className: "_UIContextMenuContainerView", isUserInteractionEnabled: true, accessibilityViewIsModal: true))
    #expect(!SystemMenuTouchGate.isOpenContextMenuContainer(
      className: "_UIContextMenuContainerView", isUserInteractionEnabled: false, accessibilityViewIsModal: true))
    #expect(!SystemMenuTouchGate.isOpenContextMenuContainer(
      className: "UIView", isUserInteractionEnabled: true, accessibilityViewIsModal: true))
  }
}
