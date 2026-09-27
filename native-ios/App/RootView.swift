import AppFoundation
import SwiftUI

struct RootView: View {
    @Environment(\.scenePhase) private var scenePhase
    @State private var retryAttempt = 0
    let bootstrap: AppBootstrap

    var body: some View {
        Group {
            switch bootstrap.state {
            case .idle, .loading:
                ProgressView("샘플을 준비하고 있어요")
            case .ready(let library):
                PreviewLibraryView(library: library)
            case .failed:
                ContentUnavailableView {
                    Label("샘플을 열 수 없어요", systemImage: "exclamationmark.triangle")
                } description: {
                    Text("저장소를 확인한 뒤 다시 시도해 주세요. 기존 데이터는 초기화하지 않았어요.")
                } actions: {
                    Button("다시 시도") { retryAttempt += 1 }
                        .accessibilityIdentifier("bootstrap-retry")
                }
            }
        }
        .task(id: Request(isActive: scenePhase == .active, retryAttempt: retryAttempt)) {
            if scenePhase == .active { await bootstrap.activate() }
        }
        .onChange(of: scenePhase) { _, phase in
            if phase != .active { bootstrap.deactivate() }
        }
        .onDisappear { bootstrap.deactivate() }
    }

    private struct Request: Equatable {
        let isActive: Bool
        let retryAttempt: Int
    }
}
