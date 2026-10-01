import AppFoundation
import LearningDomain
import LearningMedia
import SwiftUI

struct LearningRoute: Identifiable {
    let id = UUID()
    let packageKey: String
    let stage: Int
}
struct LearningPlayerView: View {
    let route: LearningRoute
    let model: ProductModel
    let profiles: ProductProfileOwner?
    @State private var boundaryToken: UUID?
    @State private var flow: LearningFlow
    @Environment(\.dismiss) private var dismiss
    @Environment(\.scenePhase) private var scenePhase
    init(route: LearningRoute, model: ProductModel, profiles: ProductProfileOwner? = nil) {
        self.route = route; self.model = model; self.profiles = profiles
        flow = LearningFlow(workspace: model.workspace)
    }
    var body: some View {
        NavigationStack {
            Group {
                if flow.accessInvalidated {
                    ContentUnavailableView {
                        Label("도서 이용 상태가 변경되었어요", systemImage: "lock")
                    } description: { Text("도서 목록에서 구매와 다운로드 상태를 다시 확인해 주세요.") } actions: {
                        Button("스테이지로 돌아가기") { Task { await exit() } }
                    }
                } else if let runtime = flow.runtime {
                    if runtime.controls.session.phase == .complete {
                        ContentUnavailableView {
                            Label("스테이지 완료", systemImage: "checkmark.seal.fill")
                        } description: { Text("확인한 학습이 저장되었어요.") } actions: {
                            Button("스테이지로 돌아가기") { Task { await exit() } }
                        }
                    } else {
                        ScrollView {
                            VStack(spacing: 20) {
                                VoiceMonitorControls(runtime: runtime)
                                LearningContentView(session: runtime.controls.session, motion: runtime.motion,
                                    preferences: model.snapshot?.preferences.learning ?? .fresh, flow: flow)
                                    .id("\(runtime.controls.session.plan.runID)-\(runtime.controls.session.unit)")
                            }.padding()
                        }
                        .background(Color(uiColor: .systemGroupedBackground))
                        .safeAreaInset(edge: .top) {
                            VStack(spacing: 0) {
                                PlayerHeaderView(runtime: runtime, flow: flow)
                                if let video = flow.video {
                                    LessonVideoSurface(transport: video).aspectRatio(16 / 9, contentMode: .fit)
                                        .clipShape(.rect(cornerRadius: 16)).accessibilityLabel("학습 영상")
                                        .accessibilityIdentifier("lesson-video")
                                        .padding([.horizontal, .top])
                                }
                            }.background(Color(uiColor: .systemGroupedBackground))
                        }
                        .safeAreaInset(edge: .bottom) { LearningControlsView(runtime: runtime) }
                    }
                } else if flow.failed {
                    ContentUnavailableView {
                        Label("학습을 열 수 없어요", systemImage: "exclamationmark.triangle")
                    } actions: {
                        Button("다시 시도") { Task { await flow.open(packageKey: route.packageKey, stage: route.stage) } }
                        Button("스테이지로 돌아가기") { dismiss() }
                    }
                } else { ProgressView("학습을 준비하고 있어요") }
            }
            .overlay {
                if let feedback = flow.runtime?.feedback {
                    LearningRewardView(feedback: feedback).id(feedback.commandID)
                }
            }
            .navigationTitle(flow.title).navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .topBarLeading) {
                    Button { Task { await flow.presentOptions(.menu) } } label: { Image(systemName: "line.3.horizontal") }
                        .accessibilityLabel("학습 옵션").accessibilityIdentifier("player-options")
                        .disabled(flow.runtime == nil)
                }
                ToolbarItem(placement: .topBarTrailing) {
                    Button("닫기") { Task { await exit() } }.accessibilityIdentifier("player-exit")
                }
            }
        }
        .interactiveDismissDisabled()
        .background { DictionaryHost(presenter: flow.playerPresenter).frame(width: 0, height: 0) }
        .onChange(of: flow.playerDictionary.busy) { _, _ in flow.dictionarySettled() }
        .sheet(item: Binding(get: { flow.options }, set: { if $0 == nil { flow.dismissOptions() } })) { option in
            LearningOptionsView(flow: flow, model: model, initial: option, exit: exit)
        }
        .task { [flow] in
            boundaryToken = profiles?.registerBoundary { [weak flow] in try await flow?.prepareServiceBoundary() }
            await flow.open(packageKey: route.packageKey, stage: route.stage)
        }
        .onChange(of: scenePhase) { _, phase in if phase != .active { flow.suspend() } }
        .onChange(of: flow.runtime?.controls) { _, _ in flow.validateReference() }
        .onChange(of: flow.closedByService) { if flow.closedByService { dismiss() } }
        .onDisappear {
            if let boundaryToken { profiles?.unregisterBoundary(boundaryToken) }
            Task { await flow.close() }
        }
    }
    private func exit() async {
        await flow.close()
        dismiss()
        await model.activate()
    }
}
private struct PlayerHeaderView: View {
    let runtime: NativeLearningRuntime
    let flow: LearningFlow
    var body: some View {
        let session = runtime.controls.session
        VStack(spacing: 8) {
            HStack {
                ProgressView(value: Double(session.units.filter { $0.confirmed == $0.planned }.count), total: Double(session.unitCount))
                    .accessibilityIdentifier("player-progress")
                ZStack(alignment: .trailing) {
                    Text("\(session.unitCount)/\(session.unitCount)").hidden().accessibilityHidden(true)
                    Text("\(session.unit + 1)/\(session.unitCount)")
                }.monospacedDigit().font(.caption.bold()).fixedSize()
            }
            HStack {
                Button { Task { await flow.presentOptions(.guide) } } label: {
                    Text("Lv \((session.plan.scope.stage + 1) / 2)").frame(minWidth: 44, minHeight: 44).contentShape(.rect)
                }
                Spacer()
                Button {
                    Task { await flow.presentOptions(session.isSilent ? .revealSpeed : .rate) }
                } label: {
                    Text(session.isSilent ? "S\(session.reveal?.level ?? 1)" : "\(session.rate.formatted())×")
                        .frame(minWidth: 44, minHeight: 44).contentShape(.rect)
                }.accessibilityLabel("학습 속도")
                Spacer()
                Button { Task { await flow.presentOptions(.analysis) } } label: {
                    Image(systemName: "text.magnifyingglass").frame(minWidth: 44, minHeight: 44).contentShape(.rect)
                }
                    .accessibilityLabel("문장 분석")
            }.buttonStyle(.borderless)
        }.padding(.horizontal).padding(.top, 8).background(.bar)
    }
}
