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
    let duplicate = expectation(description: "Duplicate rejected")
    presenter.present(id: "two", term: "door", from: root) { result in
      if case .success = result { XCTFail("A second presentation must not open") }
      duplicate.fulfill()
    }
    presenter.dismiss(id: "one") // Includes cancellation during the presentation animation.
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
}
