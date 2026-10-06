import AppFoundation
import SwiftUI

/// Actionable recovery for failed saves and service operations, inline on each
/// browsing screen. It never moves the tab bar and stays silent on success.
struct BrowsingRecoveryBar: ViewModifier {
    let model: ProductModel
    let services: ProductServicesModel?
    func body(content: Content) -> some View {
        content.safeAreaBar(edge: .top) {
            if model.failed || services?.error != nil {
                VStack(spacing: 8) {
                    if model.failed {
                        notice("변경을 저장하지 못했어요.") { Task { await model.retry() } }
                    }
                    if let services, services.error != nil {
                        notice("서비스 작업을 완료하지 못했어요.") { Task { await services.retrySync() } }
                            .disabled(services.actionBusy || services.syncState.busy)
                    }
                }.padding(.horizontal).padding(.bottom, 8)
            }
        }
    }
    private func notice(_ message: LocalizedStringKey, retry: @escaping () -> Void) -> some View {
        HStack {
            Label(message, systemImage: "exclamationmark.triangle.fill").font(.subheadline)
                .symbolRenderingMode(.multicolor)
            Spacer(minLength: 8)
            Button("다시 시도", action: retry).buttonStyle(.bordered).buttonBorderShape(.capsule)
        }.padding(12).glassEffect(.regular, in: .rect(cornerRadius: 16))
            .accessibilityElement(children: .contain)
    }
}

extension View {
    func browsingRecovery(model: ProductModel, services: ProductServicesModel?) -> some View {
        modifier(BrowsingRecoveryBar(model: model, services: services))
    }
}
