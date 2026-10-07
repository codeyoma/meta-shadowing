import SwiftUI
import UIKit

/// Uses a view anchor rather than the toolbar item, whose inline presentation covers the XP button.
struct ExperiencePopover<Content: View>: UIViewRepresentable {
    @Binding var isPresented: Bool
    @ViewBuilder let content: () -> Content

    func makeCoordinator() -> Coordinator { Coordinator(isPresented: $isPresented) }

    func makeUIView(context: Context) -> UIView {
        let view = UIView()
        view.backgroundColor = .clear
        view.isUserInteractionEnabled = false
        return view
    }

    func updateUIView(_ view: UIView, context: Context) {
        context.coordinator.isPresented = $isPresented
        guard isPresented else {
            context.coordinator.presented?.dismiss(animated: true)
            context.coordinator.presented = nil
            return
        }
        if let presented = context.coordinator.presented {
            presented.rootView = content()
            return
        }
        guard view.window != nil, let controller = presentingController(for: view),
              controller.presentedViewController == nil else { return }
        let presented = UIHostingController(rootView: content())
        presented.sizingOptions = .preferredContentSize
        presented.modalPresentationStyle = .popover
        guard let popover = presented.popoverPresentationController else { return }
        popover.sourceView = view
        popover.sourceRect = .null
        popover.permittedArrowDirections = .up
        popover.canOverlapSourceViewRect = false
        popover.delegate = context.coordinator
        context.coordinator.presented = presented
        controller.present(presented, animated: true)
    }

    private func presentingController(for view: UIView) -> UIViewController? {
        var responder: UIResponder? = view.next
        while let current = responder {
            if let controller = current as? UIViewController { return controller }
            responder = current.next
        }
        return nil
    }

    static func dismantleUIView(_ view: UIView, coordinator: Coordinator) {
        coordinator.presented?.dismiss(animated: false)
        coordinator.presented = nil
    }

    @MainActor final class Coordinator: NSObject, UIPopoverPresentationControllerDelegate {
        var isPresented: Binding<Bool>
        var presented: UIHostingController<Content>?

        init(isPresented: Binding<Bool>) { self.isPresented = isPresented }

        func adaptivePresentationStyle(for controller: UIPresentationController,
                                       traitCollection: UITraitCollection) -> UIModalPresentationStyle { .none }

        func presentationControllerDidDismiss(_ presentationController: UIPresentationController) {
            presented = nil
            isPresented.wrappedValue = false
        }
    }
}
