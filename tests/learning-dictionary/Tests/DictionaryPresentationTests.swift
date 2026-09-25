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
    XCTAssertTrue(sheet.children.contains { $0 is UIReferenceLibraryViewController })
    XCTAssertTrue(sheet.view.accessibilityViewIsModal)
    XCTAssertEqual(sheet.modalPresentationStyle, .formSheet)
    let drawer = try XCTUnwrap(sheet.sheetPresentationController)
    XCTAssertTrue(drawer.prefersGrabberVisible, "Use UIKit's interactive grabber, like the learning menu")
    XCTAssertEqual(drawer.detents.map(\.identifier), [.large], "Open at the learning drawer's full height")
    let duplicate = expectation(description: "Duplicate rejected")
    presenter.present(id: "two", term: "door", from: root) { result in
      if case .success = result { XCTFail("A second presentation must not open") }
      duplicate.fulfill()
    }
    let resume = try XCTUnwrap(sheet.view.subviews.compactMap { $0 as? UIButton }.first)
    XCTAssertEqual(resume.accessibilityLabel, "학습 이어하기")
    resume.sendActions(for: .touchUpInside) // Includes dismissal during the presentation animation.
    await fulfillment(of: [dismissed, duplicate], timeout: 5)
    XCTAssertNil(root.presentedViewController)
    XCTAssertEqual(finishes, 1)
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
    let library = try XCTUnwrap(sheet.children.first as? UIReferenceLibraryViewController)
    try await Task.sleep(for: .milliseconds(600))
    sheet.view.layoutIfNeeded()
    XCTAssertFalse(sheet.isModalInPresentation, "The drawer must allow interactive dismissal")
    XCTAssertFalse(library.isModalInPresentation, "The system child must not veto drawer dismissal")
    let resume = try XCTUnwrap(sheet.view.subviews.compactMap { $0 as? UIButton }.first)
    XCTAssertEqual(library.view.frame.minY, 16, "Only reserve space for the handle, not a duplicate top header")
    XCTAssertEqual(library.view.frame.width, sheet.view.bounds.width)
    XCTAssertLessThanOrEqual(library.view.frame.maxY, resume.frame.minY - 16,
      "Dictionary content must not extend behind the fixed learning button")
    XCTAssertEqual(resume.frame.minX, 16, accuracy: 0.5)
    XCTAssertEqual(resume.frame.maxX, sheet.view.bounds.maxX - 16, accuracy: 0.5)
    XCTAssertEqual(resume.frame.maxY, sheet.view.safeAreaLayoutGuide.layoutFrame.maxY - 16, accuracy: 0.5)
    XCTAssertGreaterThanOrEqual(resume.frame.height, 54)
    library.dismiss(animated: false)
    await fulfillment(of: [done], timeout: 5)
    XCTAssertNil(root.presentedViewController)
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
