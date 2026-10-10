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
    @State private var orientation = LessonOrientation()
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
                    } else if let video = flow.video {
                        VideoLearningView(runtime: runtime, video: video, flow: flow,
                                          model: model,
                                          preferences: model.snapshot?.preferences.learning ?? .fresh,
                                          orientation: orientation) { frame in
                            if !frame.isEmpty { rewardActionFrame = frame }
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
                    LearningRewardView(feedback: feedback, actionFrame: rewardActionFrame,
                                       overVideo: flow.video != nil).id(feedback.commandID)
                }
            }
            .coordinateSpace(.named("player-reward"))
            .navigationTitle(flow.title).navigationBarTitleDisplayMode(.inline)
            .toolbarVisibility(.hidden, for: .navigationBar)
            .safeAreaBar(edge: .top) {
                if !orientation.isFullscreen {
                    VStack(spacing: 8) {
                        if let runtime = flow.runtime, runtime.controls.session.phase != .complete, !flow.accessInvalidated {
                            PlayerHeaderView(runtime: runtime, flow: flow, model: model)
                        } else {
                            HStack {
                                PlayerOptionsButton { Task { await flow.presentOptions(.menu) } }
                                    .frame(width: 44)
                                Spacer(minLength: 0)
                            }.buttonStyle(PlayerHeaderButtonStyle())
                        }
                        if let session = flow.runtime?.controls.session {
                            PlayerProgressView(session: session)
                        }
                    }.padding(.horizontal).padding(.vertical, 6)
                }
            }
        }
        .interactiveDismissDisabled()
        .background { LessonOrientationHost(orientation: orientation).frame(width: 0, height: 0) }
        .alert("화면 방향을 변경하지 못했어요", isPresented: $orientation.failed) {
            Button("확인", role: .cancel) { }
        } message: { Text("다시 전체화면 버튼을 눌러 주세요.") }
        .background { DictionaryHost(presenter: flow.playerPresenter).frame(width: 0, height: 0) }
        .onChange(of: flow.playerDictionary.busy) { _, _ in flow.dictionarySettled() }
        .sheet(item: Binding(get: { flow.optionsUsePopover ? nil : flow.options },
                            set: { if $0 == nil && !flow.optionsUsePopover { flow.dismissOptions() } })) { option in
            LearningOptionsView(flow: flow, model: model, initial: option, exit: exit)
                .allowsHitTesting(!exiting)
        }
        .task { [flow] in
            boundaryToken = profiles?.registerBoundary { [weak flow] in try await flow?.prepareServiceBoundary() }
            await flow.startPresentedLesson()
        }
        .onChange(of: scenePhase) { _, phase in if phase != .active { flow.suspend() } }
        .onChange(of: flow.runtime?.controls) { _, _ in
            flow.validateReference()
            if flow.runtime?.controls.session.phase == .complete { orientation.release() }
        }
        .onChange(of: flow.accessInvalidated) { _, invalid in if invalid { orientation.release() } }
        .onChange(of: flow.closedByService, initial: true) { if flow.closedByService { dismiss() } }
        .onDisappear {
            orientation.release()
            if let boundaryToken { profiles?.unregisterBoundary(boundaryToken) }
            Task { await flow.close() }
        }
    }
    private func exit() async {
        guard !exiting else { return }
        exiting = true
        orientation.release()
        await flow.close(retainingPresentation: true)
        dismiss()
        await model.activate()
    }
}
struct PlayerProgressView: View {
    let session: LearningSession
    var body: some View {
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
        }.playerLayoutFrame("player-progress-row")
    }
}

private struct PlayerOptionsButton: View {
    let openOptions: () -> Void
    var body: some View {
        Button(action: openOptions) {
            Image(systemName: "slider.horizontal.3").font(.system(size: 20))
        }
        .foregroundStyle(.primary)
        .accessibilityLabel("학습 옵션").accessibilityIdentifier("player-options")
        .playerLayoutFrame("player-options")
        .accessibilityShowsLargeContentViewer { Text("학습 옵션") }
    }
}

private struct PlayerHeaderButtonStyle: ButtonStyle {
    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            // Keep full values in a narrow six-control row; the large-content viewer remains available.
            .font(.callout).lineLimit(1).minimumScaleFactor(0.25)
            .padding(.horizontal, 3)
            .frame(width: 44, height: 44)
            .contentShape(.circle)
            .glassEffect(.regular.interactive(), in: .circle)
            .opacity(configuration.isPressed ? 0.65 : 1)
    }
}
struct PlayerHeaderView: View {
    let runtime: NativeLearningRuntime
    let flow: LearningFlow
    let model: ProductModel
    var body: some View {
        let session = runtime.controls.session
        let speedValue = session.isSilent ? "S\(session.reveal?.level ?? 1)" : "\(session.rate.formatted())×"
        // Keep neighboring circles distinct, including the six-control row on small screens.
        GlassEffectContainer(spacing: 0) {
            HStack(spacing: 0) {
                PlayerOptionsButton { Task { await flow.presentOptions(.menu) } }
                Spacer(minLength: 4)
                Button { Task { await flow.presentOptions(.guide) } } label: {
                    Text("Lv \((session.plan.scope.stage + 1) / 2)")
                }.accessibilityShowsLargeContentViewer()
                    .playerLayoutFrame("player-level")
                Spacer(minLength: 4)
                Button {
                    Task { await flow.presentOptions(session.isSilent ? .revealSpeed : .rate,
                                                     asPopover: !session.isSilent) }
                } label: {
                    if session.isSilent {
                        Text(speedValue).monospacedDigit()
                    } else {
                        Image(systemName: "speedometer").font(.system(size: 20))
                    }
                }.accessibilityLabel("학습 속도").accessibilityValue(Text(speedValue))
                    .accessibilityShowsLargeContentViewer { Text("학습 속도 \(speedValue)") }
                    .playerLayoutFrame("player-speed")
                    .modifier(LearningQuickSettingAnchor(route: .rate, runtime: runtime, flow: flow, model: model))
                Spacer(minLength: 4)
                Button { Task { await flow.presentOptions(.typography, asPopover: true) } } label: {
                    Image(systemName: "textformat.size").font(.system(size: 20))
                }
                .accessibilityLabel("폰트 설정").accessibilityIdentifier("player-font")
                .accessibilityShowsLargeContentViewer { Text("폰트 설정") }
                .playerLayoutFrame("player-font")
                .modifier(LearningQuickSettingAnchor(route: .typography, runtime: runtime, flow: flow, model: model))
                if (7...10).contains(session.plan.scope.stage) {
                    Spacer(minLength: 4)
                    Button { Task { await flow.presentOptions(.group, asPopover: true) } } label: {
                        Image(systemName: "rectangle.stack").font(.system(size: 20))
                    }
                    .accessibilityLabel("학습 구간 크기").accessibilityValue(Text("\(session.plan.groupSize)구간"))
                    .accessibilityIdentifier("player-group")
                    .accessibilityShowsLargeContentViewer { Text("학습 구간 크기 \(session.plan.groupSize)구간") }
                    .playerLayoutFrame("player-group")
                    .modifier(LearningQuickSettingAnchor(route: .group, runtime: runtime, flow: flow, model: model))
                }
                Spacer(minLength: 4)
                Button { Task { await flow.presentOptions(.analysis) } } label: {
                    Image(systemName: "text.magnifyingglass").font(.system(size: 20))
                }
                    .accessibilityLabel("문장 분석").accessibilityShowsLargeContentViewer()
                    .playerLayoutFrame("player-analysis")
            }
            .buttonStyle(PlayerHeaderButtonStyle())
        }
        .onDisappear {
            // Portrait/fullscreen transitions remove this popover's anchor, even during its pause/save.
            if flow.optionsUsePopover { flow.dismissOptions() }
        }
    }
}
