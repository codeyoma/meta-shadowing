#if DEBUG
import AppFoundation
import LearningPersistence
import SwiftUI

struct DeveloperToolsView: View {
    private struct Route: Identifiable {
        enum Kind { case analysis, audio, download }
        let id = UUID()
        let kind: Kind
        var root: URL { URL.applicationSupportDirectory.appending(path: "NativeDiagnostics/\(id.uuidString)") }
    }
    @State private var route: Route?
    var body: some View {
        List {
            Text("개발 전용입니다. 공개 샘플과 별도 테스트 저장소만 사용합니다.").font(.footnote)
            Button("문장 분석 실험") { route = Route(kind: .analysis) }
            Button("오디오 · 모니터링 실험") { route = Route(kind: .audio) }
            Button("다운로드 미리보기") { route = Route(kind: .download) }
        }.navigationTitle("개발 도구")
            .fullScreenCover(item: $route) { selected in
                Group {
                    switch selected.kind {
                    case .analysis: DeveloperAnalysisView(root: selected.root)
                    case .audio: SyntheticMediaProbeView(root: selected.root, mode: "audio")
                    case .download: DeveloperDownloadView()
                    }
                }.safeAreaInset(edge: .top) {
                    HStack {
                        Text("개발 전용").font(.caption)
                        Spacer()
                        Button("테스트 닫기") { route = nil }.frame(minHeight: 44)
                            .accessibilityIdentifier("diagnostic-close")
                    }.padding(.horizontal).background(.bar)
                }.interactiveDismissDisabled()
            }
    }
}

private struct DeveloperAnalysisView: View {
    @State private var flow: LearningFlow
    @Environment(\.scenePhase) private var scenePhase
    init(root: URL) {
        flow = LearningFlow(workspace: ProductWorkspace(store: SQLiteLearningStore(root: root.appending(path: "store")),
            catalog: ProductTestCatalog(root: root.appending(path: "assets"), mode: "analysis"), profileID: "diagnostic"))
    }
    var body: some View {
        NavigationStack {
            if flow.options != nil { AnalysisBrowserView(flow: flow) }
            else if flow.failed { ContentUnavailableView("테스트 자료를 열 수 없어요", systemImage: "exclamationmark.triangle") }
            else { Button("분석 자료 열기") { Task { await open() } } }
        }
        .task { await open() }
        .onChange(of: scenePhase) { _, phase in if phase != .active { flow.suspend() } }
        .onDisappear { Task { await flow.close() } }
    }
    private func open() async {
        await flow.open(packageKey: "ui-fixture-v1", stage: 1)
        guard !Task.isCancelled else { await flow.close(); return }
        await flow.presentOptions(.analysis)
    }
}
#endif
