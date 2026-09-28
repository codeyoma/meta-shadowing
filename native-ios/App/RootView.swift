import AppFoundation
import SwiftUI

struct RootView: View {
    @Environment(\.scenePhase) private var scenePhase
    let model: ProductModel

    var body: some View {
        Group {
            if model.snapshot != nil { ProductTabsView(model: model) }
            else if model.failed {
                ContentUnavailableView {
                    Label("도서를 열 수 없어요", systemImage: "exclamationmark.triangle")
                } description: {
                    Text("저장소를 확인한 뒤 다시 시도해 주세요. 기존 데이터는 초기화하지 않았어요.")
                } actions: {
                    Button("다시 시도") { Task { await model.retry() } }
                        .accessibilityIdentifier("bootstrap-retry")
                }
            } else { ProgressView("도서를 준비하고 있어요") }
        }
        .task(id: scenePhase) {
            if scenePhase == .active { await model.activate() }
        }
        .onChange(of: scenePhase) { _, phase in
            if phase != .active { model.deactivate() }
        }
        .onDisappear { model.deactivate() }
    }

}
