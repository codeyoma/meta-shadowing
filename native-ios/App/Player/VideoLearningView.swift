import AppFoundation
import LearningDomain
import LearningMedia
import SwiftUI

/// Both presentations share one surface and one text subtree, including reveal state.
struct VideoLearningView: View {
    let runtime: NativeLearningRuntime
    let video: VideoSegmentTransport
    let flow: LearningFlow
    let model: ProductModel
    let preferences: LearningPreferences
    let orientation: LessonOrientation
    let onActionFrameChange: (CGRect) -> Void
    @Environment(\.colorScheme) private var colorScheme
    @State private var captionPosition = ScrollPosition(edge: .top)
    @State private var dockOnLeft = false

    var body: some View {
        GeometryReader { geometry in
            let full = orientation.isFullscreen
            let videoHeight = full ? geometry.size.height : min((geometry.size.width - 32) * 9 / 16 + 16, geometry.size.height * 0.6)
            let textHeight = full ? max(0, min(geometry.size.height * 0.55, geometry.size.height - 64))
                : max(0, geometry.size.height - videoHeight)
            ZStack(alignment: .top) {
                LessonVideoSurface(transport: video)
                    .background(.black)
                    .clipShape(.rect(cornerRadius: full ? 0 : 16))
                    .padding(.horizontal, full ? 0 : 16)
                    .padding(.top, full ? 0 : 16)
                    .frame(height: videoHeight)
                    .accessibilityLabel("학습 영상").accessibilityIdentifier("lesson-video")
                    .playerLayoutFrame("lesson-video")
                VStack(spacing: 0) {
                    Color.clear.frame(height: full ? geometry.size.height - textHeight - 16 : videoHeight)
                    ScrollView {
                        VStack(spacing: 20) {
                            if !full { VoiceMonitorControls(runtime: runtime) }
                            VideoLearningCaptions(runtime: runtime, video: video, flow: flow,
                                                  preferences: preferences, fullscreen: full)
                                .id("\(runtime.controls.session.plan.runID)-\(runtime.controls.session.unit)")
                        }.padding(full ? 4 : 16)
                    }
                    .defaultScrollAnchor(full ? .bottom : .center, for: .alignment)
                    .scrollPosition($captionPosition)
                    .onChange(of: full) { _, _ in captionPosition.scrollTo(edge: .top) }
                    .onChange(of: geometry.size) { _, _ in captionPosition.scrollTo(edge: .top) }
                    .frame(height: textHeight)
                    .clipped()
                    // Reserve both thumb lanes so captions stay centered and never sit under a docked action.
                    .padding(.horizontal, full ? FullscreenLearningDock.width + 8 : 0)
                }
            }
            .overlay {
                if full {
                    FullscreenLearningDock(runtime: runtime, onLeft: $dockOnLeft,
                                           onActionFrameChange: onActionFrameChange)
                }
            }
            .overlay(alignment: .topTrailing) {
                if !full {
                    Button { orientation.setFullscreen(true) } label: {
                        Image(systemName: "arrow.up.left.and.arrow.down.right")
                            .frame(width: 44, height: 44)
                            .background(.regularMaterial, in: .circle)
                    }
                    .buttonStyle(.plain)
                    .accessibilityLabel("영상 전체화면")
                    .accessibilityIdentifier("video-enter-fullscreen")
                    .padding(24)
                }
            }
            .overlay(alignment: .top) {
                if full {
                    FullscreenLearningToolbar(runtime: runtime, flow: flow, model: model,
                                              orientation: orientation, maximumPopupHeight: max(100, geometry.size.height - 60))
                }
            }
        }
        .safeAreaBar(edge: .top) {
            if !orientation.isFullscreen { PlayerHeaderView(runtime: runtime, flow: flow, model: model) }
        }
        .safeAreaBar(edge: .bottom) {
            if !orientation.isFullscreen {
                LearningControlsView(runtime: runtime, onActionFrameChange: onActionFrameChange)
            }
        }
        .background(orientation.isFullscreen ? Color.black : Color(uiColor: .systemGroupedBackground))
        .environment(\.colorScheme, orientation.isFullscreen ? .dark : colorScheme)
    }
}

private struct FullscreenLearningToolbar: View {
    let runtime: NativeLearningRuntime
    let flow: LearningFlow
    let model: ProductModel
    let orientation: LessonOrientation
    let maximumPopupHeight: CGFloat

    var body: some View {
        HStack(spacing: 8) {
            tool("학습 옵션", symbol: "slider.horizontal.3", id: "video-options", route: .menu)
            Button { Task { await flow.presentOptions(.guide) } } label: {
                Text("Lv \((runtime.controls.session.plan.scope.stage + 1) / 2)")
                    .font(.system(size: 14, weight: .medium)).monospacedDigit()
                    .frame(width: 44, height: 44).background(.regularMaterial, in: .circle)
            }
            .accessibilityIdentifier("video-guide")
            .accessibilityShowsLargeContentViewer { Text("학습방법") }
            .disabled(runtime.controls.saveFailed || !runtime.controls.active || flow.accessInvalidated)
            quickTool("배속", symbol: "speedometer", id: "video-rate", route: .rate)
            quickTool("전체화면 폰트 크기", symbol: "textformat.size", id: "video-font-size", route: .fullscreenTypography)
            if (7...10).contains(runtime.controls.session.plan.scope.stage) {
                quickTool("다구간 학습 사이즈", symbol: "rectangle.stack", id: "video-group", route: .group)
            }
            tool("문장 분석", symbol: "text.magnifyingglass", id: "video-analysis", route: .analysis)
            Spacer(minLength: 0)
            Button { orientation.setFullscreen(false) } label: {
                Image(systemName: "arrow.down.right.and.arrow.up.left")
                    .font(.system(size: 20))
                    .frame(width: 44, height: 44).background(.regularMaterial, in: .circle)
            }.accessibilityLabel("전체화면 나가기").accessibilityIdentifier("video-exit-fullscreen")
                .accessibilityShowsLargeContentViewer { Text("전체화면 나가기") }
        }
        .buttonStyle(.plain)
        .padding(4)
        .onDisappear {
            // The pause/save can finish after its fullscreen button anchor disappears.
            if flow.optionsUsePopover { flow.dismissOptions() }
        }
    }

    private func quickTool(_ label: LocalizedStringKey, symbol: String, id: String, route: LearningOptionRoute) -> some View {
        tool(label, symbol: symbol, id: id, route: route, asPopover: true)
            .modifier(LearningQuickSettingAnchor(route: route, runtime: runtime, flow: flow, model: model,
                                                 maximumHeight: maximumPopupHeight))
    }

    private func tool(_ label: LocalizedStringKey, symbol: String, id: String, route: LearningOptionRoute,
                      asPopover: Bool = false) -> some View {
        Button { Task { await flow.presentOptions(route, asPopover: asPopover) } } label: {
            Image(systemName: symbol).font(.system(size: 20))
                .frame(width: 44, height: 44).background(.regularMaterial, in: .circle)
        }
        .accessibilityLabel(Text(label)).accessibilityIdentifier(id)
        .accessibilityShowsLargeContentViewer { Text(label) }
        .disabled(route != .menu && (runtime.controls.saveFailed || !runtime.controls.active || flow.accessInvalidated))
    }
}

/// One presentation/editor implementation for portrait and fullscreen quick settings.
struct LearningQuickSettingAnchor: ViewModifier {
    let route: LearningOptionRoute
    let runtime: NativeLearningRuntime
    let flow: LearningFlow
    let model: ProductModel
    var maximumHeight: CGFloat = 320

    func body(content: Content) -> some View {
        content.popover(isPresented: Binding(get: { flow.optionsUsePopover && flow.options == route }, set: { shown in
            if !shown && flow.optionsUsePopover && flow.options == route { flow.dismissOptions() }
        }), arrowEdge: .top) {
            LearningQuickSettingPopover(route: route, runtime: runtime, flow: flow, model: model, maximumHeight: maximumHeight)
                .presentationCompactAdaptation(.popover)
        }
    }
}

private struct LearningQuickSettingPopover: View {
    let route: LearningOptionRoute
    let runtime: NativeLearningRuntime
    let flow: LearningFlow
    let model: ProductModel
    let maximumHeight: CGFloat
    @ScaledMetric(relativeTo: .body) private var rowHeight = 52.0

    var body: some View {
        let settings = LearningPreferenceSession(runtime: runtime, model: model)
        let desiredHeight = rowHeight * (route == .fullscreenTypography ? 3 : route == .rate ? 1.25 : 1) + 68
        VStack(spacing: 0) {
            HStack {
                Text(route.title).font(.headline)
                Spacer(minLength: 8)
                Button { flow.dismissOptions() } label: {
                    Image(systemName: "xmark").font(.system(size: 18)).frame(width: 44, height: 44)
                }.accessibilityLabel("닫기").accessibilityIdentifier("options-close")
            }.padding(.leading, 16).padding(.trailing, 4)
            Divider()
            PreferenceEditorView(option: route, preferences: settings.value, videoLayout: true, compact: true) { value in
                await settings.save(value, for: route)
            }.disabled(runtime.controls.saveFailed || !runtime.controls.active || flow.accessInvalidated)
            if runtime.controls.saveFailed {
                Button("저장 다시 시도") { Task { _ = await runtime.coordinator.retrySave() } }
                    .accessibilityIdentifier("options-save-retry").frame(minHeight: 44)
            }
        }
        .frame(width: 340, height: min(maximumHeight, desiredHeight + (runtime.controls.saveFailed ? 84 : 0)))
        .accessibilityElement(children: .contain)
        .accessibilityIdentifier("learning-setting-popup")
    }
}

private struct VideoLearningCaptions: View {
    let runtime: NativeLearningRuntime
    let video: VideoSegmentTransport
    let flow: LearningFlow
    let preferences: LearningPreferences
    let fullscreen: Bool

    var body: some View {
        let session = runtime.controls.session
        let member = video.presentation.member(planID: runtime.state.controller.snapshot.handle.planID,
                                                unit: session.unit, cycle: session.current.confirmed + 1)
        LearningContentView(session: session, motion: runtime.motion, preferences: preferences, flow: flow,
                            sourceMember: fullscreen ? member : nil, contentReady: !fullscreen || member != nil,
                            fullscreenCaptions: fullscreen)
    }
}

/// Dragging is presentation-only. The high-priority drag cancels a button press before it can confirm work.
private struct FullscreenLearningDock: View {
    static let width: CGFloat = 122
    private let edgeMargin: CGFloat = 4
    let runtime: NativeLearningRuntime
    @Binding var onLeft: Bool
    let onActionFrameChange: (CGRect) -> Void
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    @GestureState private var translation = CGSize.zero

    var body: some View {
        GeometryReader { geometry in
            let travel = max(0, geometry.size.width - Self.width - 2 * edgeMargin)
            let origin = onLeft ? edgeMargin : travel + edgeMargin
            LearningControlsView(runtime: runtime, onActionFrameChange: { frame in
                // Keep the XP receipt readable and above the cycle dots, even though the action is smaller.
                onActionFrameChange(CGRect(x: frame.midX - Self.width / 2, y: frame.minY - 38,
                                           width: Self.width, height: frame.height))
            }, compact: true, compactOnLeft: onLeft)
            .frame(width: Self.width)
            .contentShape(.rect)
            .highPriorityGesture(
                DragGesture(minimumDistance: 12, coordinateSpace: .named("fullscreen-dock"))
                    .updating($translation) { value, state, _ in state = value.translation }
                    .onEnded { value in
                        onLeft = origin + Self.width / 2 + value.predictedEndTranslation.width < geometry.size.width / 2
                    }
            )
            .accessibilityElement(children: .contain)
            .accessibilityLabel("학습 버튼 위치")
            .accessibilityHint("좌우로 밀어 위치를 바꿀 수 있어요")
            .accessibilityAction(named: "왼쪽으로 이동") { move(left: true) }
            .accessibilityAction(named: "오른쪽으로 이동") { move(left: false) }
            .padding(.bottom, edgeMargin)
            .frame(maxHeight: .infinity, alignment: .bottom)
            .offset(x: min(travel + edgeMargin, max(edgeMargin, origin + translation.width)))
            .animation(translation == .zero && !reduceMotion ? .spring(duration: 0.3, bounce: 0.15) : nil,
                       value: translation == .zero)
        }
        .coordinateSpace(.named("fullscreen-dock"))
    }

    private func move(left: Bool) {
        withAnimation(reduceMotion ? nil : .spring(duration: 0.3, bounce: 0.15)) { onLeft = left }
    }
}
