import SwiftUI
import UIKit

/// The host belongs to the visible screen, not a process-wide key window.
struct DictionaryHost: UIViewControllerRepresentable {
    let presenter: DictionaryPresenter
    func makeUIViewController(context: Context) -> UIViewController {
        let host = UIViewController()
        host.view.backgroundColor = .clear
        presenter.host = host
        return host
    }
    func updateUIViewController(_ controller: UIViewController, context: Context) {}
    static func dismantleUIViewController(_ controller: UIViewController, coordinator: ()) {
        controller.presentedViewController?.dismiss(animated: false)
    }
}
