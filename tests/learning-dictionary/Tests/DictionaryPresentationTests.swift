import XCTest
import UIKit

@MainActor
final class DictionaryPresentationTests: XCTestCase {
  func testNativeSheetContainsSystemDictionaryAndDismissesOnce() async throws {
    let scene = try XCTUnwrap(UIApplication.shared.connectedScenes.first as? UIWindowScene)
    let window = UIWindow(windowScene: scene)
    let root = UIViewController()
    window.rootViewController = root
    window.makeKeyAndVisible()
    defer { window.isHidden = true }
    let presenter = DictionaryPresenter()
    let dismissed = expectation(description: "Dismissed")
    var finishes = 0
    presenter.present(id: "one", term: "window", from: root) { result in
      if case .failure = result { XCTFail("Dictionary presentation failed") }
      finishes += 1; dismissed.fulfill()
    }
    let sheet = try XCTUnwrap(root.presentedViewController)
    let navigation = try XCTUnwrap(sheet as? UINavigationController)
    let content = try XCTUnwrap(navigation.viewControllers.first)
    content.loadViewIfNeeded()
    let lifecycle = DismissalLifecycleObserver()
    content.addChild(lifecycle); content.view.addSubview(lifecycle.view); lifecycle.didMove(toParent: content)
    XCTAssertTrue(content.children.contains { $0 is UIReferenceLibraryViewController })
    XCTAssertNil(content.title, "Only Apple's dictionary should display the lookup term")
    XCTAssertNil(content.navigationItem.rightBarButtonItem, "Do not duplicate Apple's close control")
    XCTAssertTrue(navigation.isNavigationBarHidden, "Do not reserve space for an empty app-owned header")
    XCTAssertTrue(sheet.view.accessibilityViewIsModal)
    XCTAssertEqual(sheet.modalPresentationStyle, .formSheet)
    let drawer = try XCTUnwrap(sheet.sheetPresentationController)
    XCTAssertTrue(drawer.prefersGrabberVisible, "Use UIKit's interactive grabber, like the learning menu")
    XCTAssertEqual(drawer.preferredCornerRadius, 32)
    XCTAssertEqual(drawer.detents.map(\.identifier), [.large], "Open at the learning drawer's full height")
    let duplicate = expectation(description: "Duplicate rejected")
    presenter.present(id: "two", term: "door", from: root) { result in
      if case .success = result { XCTFail("A second presentation must not open") }
      duplicate.fulfill()
    }
    let resume = try XCTUnwrap(content.view.subviews.compactMap { $0 as? UIButton }.first)
    XCTAssertEqual(resume.accessibilityLabel, "학습 이어하기")
    resume.sendActions(for: .touchUpInside) // Includes dismissal during the presentation animation.
    await fulfillment(of: [dismissed, duplicate], timeout: 5)
    XCTAssertNil(root.presentedViewController)
    XCTAssertEqual(finishes, 1)
    XCTAssertEqual(lifecycle.dismissalAnimated, true, "A user dismissal requested during opening must remain animated")
  }

  func testMissingTermAndSystemChildDismissalRemainRecoverable() async throws {
    let scene = try XCTUnwrap(UIApplication.shared.connectedScenes.first as? UIWindowScene)
    let window = UIWindow(windowScene: scene), root = UIViewController()
    window.rootViewController = root; window.makeKeyAndVisible()
    defer { window.isHidden = true }
    let presenter = DictionaryPresenter()
    let done = expectation(description: "System dismissal")
    presenter.present(id: "missing", term: "zzfixturewordunknown", from: root) { result in
      if case .failure = result { XCTFail("A missing definition is not a presentation failure") }
      done.fulfill()
    }
    let sheet = try XCTUnwrap(root.presentedViewController)
    let navigation = try XCTUnwrap(sheet as? UINavigationController)
    let content = try XCTUnwrap(navigation.viewControllers.first)
    content.loadViewIfNeeded()
    let library = try XCTUnwrap(content.children.first as? UIReferenceLibraryViewController)
    try await Task.sleep(for: .milliseconds(600))
    sheet.view.layoutIfNeeded()
    XCTAssertFalse(sheet.isModalInPresentation, "The drawer must allow interactive dismissal")
    XCTAssertFalse(library.isModalInPresentation, "The system child must not veto drawer dismissal")
    let resume = try XCTUnwrap(content.view.subviews.compactMap { $0 as? UIButton }.first)
    XCTAssertEqual(library.view.frame.minY, content.view.safeAreaLayoutGuide.layoutFrame.minY,
      "The system dictionary must start at the safe area without an extra app-owned header")
    XCTAssertEqual(library.view.frame.width, content.view.bounds.width)
    XCTAssertLessThanOrEqual(library.view.frame.maxY, resume.frame.minY - 16,
      "Dictionary content must not extend behind the fixed learning button")
    XCTAssertEqual(resume.frame.minX, 16, accuracy: 0.5)
    XCTAssertEqual(resume.frame.maxX, content.view.bounds.maxX - 16, accuracy: 0.5)
    XCTAssertEqual(resume.frame.maxY,
      content.view.bounds.maxY - max(16, content.view.safeAreaInsets.bottom) - 4, accuracy: 0.5,
      "Match the menu footer's safe-area padding and four-point button shadow space")
    XCTAssertGreaterThanOrEqual(resume.frame.height, 54)
    library.dismiss(animated: false)
    await fulfillment(of: [done], timeout: 5)
    XCTAssertNil(root.presentedViewController)
  }

  func testLifecycleCancellationOverridesDeferredUserAnimation() async throws {
    let scene = try XCTUnwrap(UIApplication.shared.connectedScenes.first as? UIWindowScene)
    let window = UIWindow(windowScene: scene), root = UIViewController()
    window.rootViewController = root; window.makeKeyAndVisible()
    defer { window.isHidden = true }
    let presenter = DictionaryPresenter()
    for userFirst in [true, false] {
      let done = expectation(description: "Lifecycle dismissal")
      presenter.present(id: "pending", term: "window", from: root) { result in
        if case .failure = result { XCTFail("Presentation failed") }
        done.fulfill()
      }
      let sheet = try XCTUnwrap(root.presentedViewController)
      let navigation = try XCTUnwrap(sheet as? UINavigationController)
      let content = try XCTUnwrap(navigation.viewControllers.first)
      content.loadViewIfNeeded()
      let lifecycle = DismissalLifecycleObserver()
      content.addChild(lifecycle); content.view.addSubview(lifecycle.view); lifecycle.didMove(toParent: content)
      XCTAssertTrue(sheet.isBeingPresented)
      if userFirst { XCTAssertTrue(sheet.accessibilityPerformEscape()) }
      presenter.dismissCurrent()
      if !userFirst { XCTAssertTrue(sheet.accessibilityPerformEscape()) }
      await fulfillment(of: [done], timeout: 5)
      XCTAssertEqual(lifecycle.dismissalAnimated, false)
      XCTAssertNil(root.presentedViewController)
    }
  }

  func testDetachedPresentationAndShutdownRejectFurtherContent() async throws {
    let presenter = DictionaryPresenter()
    var failures = 0
    presenter.present(id: "detached", term: "window", from: UIViewController()) { result in
      if case .failure = result { failures += 1 }
    }
    presenter.shutdown()
    let scene = try XCTUnwrap(UIApplication.shared.connectedScenes.first as? UIWindowScene)
    let window = UIWindow(windowScene: scene), root = UIViewController()
    window.rootViewController = root; window.makeKeyAndVisible()
    defer { window.isHidden = true }
    presenter.present(id: "closed", term: "window", from: root) { result in
      if case .failure = result { failures += 1 }
    }
    XCTAssertEqual(failures, 2)
    XCTAssertNil(root.presentedViewController)
  }

  func testAccessibilityEscapeDismissesOnceAndAllowsAnotherLookup() async throws {
    let scene = try XCTUnwrap(UIApplication.shared.connectedScenes.first as? UIWindowScene)
    let window = UIWindow(windowScene: scene), root = UIViewController()
    window.rootViewController = root; window.makeKeyAndVisible()
    defer { window.isHidden = true }
    let presenter = DictionaryPresenter()
    for id in ["first", "again"] {
      let done = expectation(description: "Escape dismissal \(id)")
      presenter.present(id: id, term: "window", from: root) { result in
        if case .failure = result { XCTFail("Dismissal must leave the next lookup usable") }
        done.fulfill()
      }
      let sheet = try XCTUnwrap(root.presentedViewController)
      sheet.view.layoutIfNeeded()
      XCTAssertNil(sheet.view.subviews.first { $0.accessibilityLabel == "사전 닫기" },
        "A custom release-only handle must not intercept the native drawer gesture")
      XCTAssertTrue(sheet.accessibilityPerformEscape())
      await fulfillment(of: [done], timeout: 5)
      XCTAssertNil(root.presentedViewController)
    }
  }
}

@MainActor
private final class DismissalLifecycleObserver: UIViewController {
  var dismissalAnimated: Bool?
  override func viewWillDisappear(_ animated: Bool) {
    super.viewWillDisappear(animated)
    dismissalAnimated = animated
  }
}
