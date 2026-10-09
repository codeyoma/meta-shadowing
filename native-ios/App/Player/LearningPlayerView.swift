import AppFoundation
import LearningDomain
import LearningMedia
import SwiftUI

struct LearningPlayerView: View {
    let route: LearningEntry.Route
    let model: ProductModel
    let profiles: ProductProfileOwner?
    @State private var boundaryToken: UUID?
    private let flow: LearningFlow
    @State private var exiting = false
    // Retain the last action frame for the final receipt, after completion removes the footer.
    @State private var rewardActionFrame: CGRect = .zero
    @Environment(\.dismiss) private var dismiss
    @Environment(\.scenePhase) private var scenePhase
    init(route: LearningEntry.Route, model: ProductModel, profiles: ProductProfileOwner? = nil) {
        self.route = route; self.model = model; self.profiles = profiles
        flow = route.flow
    }
    var body: some View {
        NavigationStack {
            Group {
                if flow.accessInvalidated {
                    ContentUnavailableView {
                        Label("도서 이용 상태가 변경되었어요", systemImage: "lock")
                    } description: { Text("책장에서 다운로드 상태를 다시 확인해 주세요.") } actions: {
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
                        // Center content that fits; longer lessons retain normal top-first scrolling.
                        .defaultScrollAnchor(.center, for: .alignment)
                        .background(Color(uiColor: .systemGroupedBackground))
                        .safeAreaBar(edge: .top) {
                            VStack(spacing: 0) {
                                PlayerHeaderView(runtime: runtime, flow: flow)
                                if let video = flow.video {
                                    // The video stays fixed above the scrolling text and is never obscured.
                                    LessonVideoSurface(transport: video).aspectRatio(16 / 9, contentMode: .fit)
                                        .clipShape(.rect(cornerRadius: 16)).accessibilityLabel("학습 영상")
                                        .accessibilityIdentifier("lesson-video")
                                        .playerLayoutFrame("lesson-video")
                                        .padding([.horizontal, .top])
                                }
                            }
                        }
                        .safeAreaBar(edge: .bottom) {
                            LearningControlsView(runtime: runtime) { frame in
                                if !frame.isEmpty { rewardActionFrame = frame }
                            }
                        }
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
                    LearningRewardView(feedback: feedback, actionFrame: rewardActionFrame).id(feedback.commandID)
                }
            }
            .coordinateSpace(.named("player-reward"))
            .navigationTitle(flow.title).navigationBarTitleDisplayMode(.inline)
            .toolbarVisibility(.hidden, for: .navigationBar)
            .safeAreaBar(edge: .top) {
                PlayerTitleView(title: flow.title.isEmpty ? String(localized: "학습") : flow.title,
                                session: flow.runtime?.controls.session) {
                    Task { await flow.presentOptions(.menu) }
                }
            }
        }
        .interactiveDismissDisabled()
        .background { DictionaryHost(presenter: flow.playerPresenter).frame(width: 0, height: 0) }
        .onChange(of: flow.playerDictionary.busy) { _, _ in flow.dictionarySettled() }
        .sheet(item: Binding(get: { flow.options }, set: { if $0 == nil { flow.dismissOptions() } })) { option in
            LearningOptionsView(flow: flow, model: model, initial: option, exit: exit)
                .allowsHitTesting(!exiting)
        }
        .task { [flow] in
            boundaryToken = profiles?.registerBoundary { [weak flow] in try await flow?.prepareServiceBoundary() }
            await flow.startPresentedLesson()
        }
        .onChange(of: scenePhase) { _, phase in if phase != .active { flow.suspend() } }
        .onChange(of: flow.runtime?.controls) { _, _ in flow.validateReference() }
        .onChange(of: flow.closedByService, initial: true) { if flow.closedByService { dismiss() } }
        .onDisappear {
            if let boundaryToken { profiles?.unregisterBoundary(boundaryToken) }
            Task { await flow.close() }
        }
    }
    private func exit() async {
        guard !exiting else { return }
        exiting = true
        await flow.close(retainingPresentation: true)
        dismiss()
        await model.activate()
    }
}
struct PlayerTitleView: View {
    let title: String
    let session: LearningSession?
    let openOptions: () -> Void
    private let optionsSize: CGFloat = 44
    private let optionsSpacing: CGFloat = 12
    var body: some View {
        VStack(spacing: 2) {
            Text(title).font(.headline).lineLimit(1)
                .accessibilityIdentifier("player-book-title")
                .playerLayoutFrame("player-book-title")
                .accessibilityShowsLargeContentViewer()
                .padding(.horizontal, optionsSize + optionsSpacing)
                .frame(maxWidth: .infinity)
            if let session {
                HStack(spacing: 8) {
                    ProgressView(value: Double(session.units.filter { $0.confirmed == $0.planned }.count), total: Double(session.unitCount))
                        .tint(BrandStyle.yellow)
                        .accessibilityIdentifier("player-progress")
                        .playerLayoutFrame("player-progress")
                    ZStack(alignment: .trailing) {
                        Text("\(session.unitCount)/\(session.unitCount)").hidden().accessibilityHidden(true)
                        Text("\(session.unit + 1)/\(session.unitCount)")
                            .playerLayoutFrame("player-counter")
                    }.monospacedDigit().font(.caption2.bold()).fixedSize()
                }.padding(.leading, optionsSize + optionsSpacing)
            }
        }
        .frame(maxWidth: .infinity, minHeight: optionsSize)
        .overlay(alignment: .leading) {
            Button(action: openOptions) {
                Image(systemName: "slider.horizontal.3").font(.system(size: 20))
                    .frame(width: optionsSize, height: optionsSize)
                    .contentShape(.circle)
                    .glassEffect(.regular.interactive(), in: .circle)
            }.buttonStyle(.plain).foregroundStyle(.primary)
                .accessibilityLabel("학습 옵션").accessibilityIdentifier("player-options")
                .playerLayoutFrame("player-options")
                .accessibilityShowsLargeContentViewer { Text("학습 옵션") }
        }
        .padding(.horizontal).padding(.vertical, 6)
    }
}
private struct PlayerHeaderView: View {
    let runtime: NativeLearningRuntime
    let flow: LearningFlow
    var body: some View {
        let session = runtime.controls.session
        VStack(spacing: 8) {
            GlassEffectContainer {
                HStack {
                    Button { Task { await flow.presentOptions(.guide) } } label: {
                        Text("Lv \((session.plan.scope.stage + 1) / 2)")
                            .lineLimit(1).minimumScaleFactor(0.75).frame(minWidth: 32)
                    }.accessibilityShowsLargeContentViewer()
                        .playerLayoutFrame("player-level")
                    Spacer()
                    Button {
                        Task { await flow.presentOptions(session.isSilent ? .revealSpeed : .rate) }
                    } label: {
                        Text(session.isSilent ? "S\(session.reveal?.level ?? 1)" : "\(session.rate.formatted())×")
                            .monospacedDigit().lineLimit(1).minimumScaleFactor(0.75).frame(minWidth: 32)
                    }.accessibilityLabel("학습 속도").accessibilityShowsLargeContentViewer()
                        .playerLayoutFrame("player-speed")
                    Spacer()
                    Button { Task { await flow.presentOptions(.analysis) } } label: {
                        Image(systemName: "text.magnifyingglass").frame(minWidth: 32)
                    }
                        .accessibilityLabel("문장 분석").accessibilityShowsLargeContentViewer()
                        .playerLayoutFrame("player-analysis")
                }
                .buttonStyle(.glass).buttonBorderShape(.capsule).controlSize(.large)
            }
        }.padding(.horizontal).padding(.top, 8)
    }
}
