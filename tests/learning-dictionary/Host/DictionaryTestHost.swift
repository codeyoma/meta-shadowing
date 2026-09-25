import SwiftUI
import UIKit

@main
struct DictionaryTestHost: App {
  var body: some Scene { WindowGroup { DictionaryFixture() } }
}

private struct DictionaryFixture: UIViewControllerRepresentable {
  func makeUIViewController(context: Context) -> DictionaryFixtureController { DictionaryFixtureController() }
  func updateUIViewController(_ controller: DictionaryFixtureController, context: Context) {}
}

private final class DictionaryFixtureController: UIViewController {
  private let presenter = DictionaryPresenter()
  private let status = UILabel()

  override func viewDidLoad() {
    super.viewDidLoad()
    view.backgroundColor = .systemBackground
    status.text = "Ready"
    status.accessibilityIdentifier = "dictionary.fixture.status"
    let open = UIButton(type: .system, primaryAction: UIAction(title: "Open dictionary") { [weak self] _ in
      guard let self else { return }
      self.status.text = "Open"
      self.presenter.present(id: "fixture", term: "window", from: self) { [weak self] result in
        self?.status.text = if case .success = result { "Dismissed" } else { "Failed" }
      }
    })
    open.accessibilityIdentifier = "dictionary.fixture.open"
    let stack = UIStackView(arrangedSubviews: [status, open])
    stack.axis = .vertical
    stack.spacing = 20
    stack.translatesAutoresizingMaskIntoConstraints = false
    view.addSubview(stack)
    NSLayoutConstraint.activate([
      stack.centerXAnchor.constraint(equalTo: view.centerXAnchor),
      stack.centerYAnchor.constraint(equalTo: view.centerYAnchor),
    ])
  }
}
