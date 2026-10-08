import LearningDomain
import LearningMedia
import SwiftUI

struct LearningControlsView: View {
    let runtime: NativeLearningRuntime
    let onActionFrameChange: (CGRect) -> Void
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    // Different SF Symbols must not move the footer when playback changes state.
    @ScaledMetric(relativeTo: .body) private var actionSymbolHeight = 20.0
    var body: some View {
        let controls = runtime.controls, session = controls.session
        VStack(spacing: 12) {
            if !session.isSilent {
                CycleTimelineView(session: session, motion: runtime.motion)
            }
            if controls.saveFailed {
                Text("학습 기록을 저장하지 못했어요.").font(.footnote)
                Button("저장 다시 시도") { Task { _ = await runtime.coordinator.retrySave() } }
                    .accessibilityIdentifier("player-save-retry")
            } else if controls.error != nil {
                Text("자료를 재생하지 못했어요.").font(.footnote)
                Button("재생 다시 시도") { Task { _ = await runtime.coordinator.retryMedia() } }
                    .accessibilityIdentifier("player-media-retry")
            }
            HStack(spacing: 12) {
                if session.showsThirdCycleChoices || session.canRepeat {
                    // The learning contract keeps Repeat as a named icon control beside the wider main action.
                    Button { Task { _ = await runtime.coordinator.perform(.repeat) } } label: {
                        Image(systemName: "repeat").frame(maxWidth: .infinity)
                            .frame(height: actionSymbolHeight)
                    }.buttonStyle(.glass).buttonBorderShape(.capsule).controlSize(.large)
                        .accessibilityLabel("두 번 더 연습하기").accessibilityIdentifier("player-repeat")
                        .disabled(!controls.repeatable).frame(maxWidth: 80)
                        .accessibilityShowsLargeContentViewer()
                }
                Button {
                    if let action = runtime.controls.mainAction { Task { _ = await runtime.coordinator.perform(action) } }
                } label: {
                    Image(systemName: symbol(controls.mainAction))
                        .frame(maxWidth: .infinity)
                        .frame(height: actionSymbolHeight)
                }.accessibilityLabel(label(controls.mainAction))
                    .accessibilityIdentifier("player-main")
                    .disabled(controls.mainAction == nil)
                    .buttonStyle(.floatingPrimaryAction)
                    .accessibilityShowsLargeContentViewer()
                    .playerLayoutFrame("player-main")
                    .onGeometryChange(for: CGRect.self) { geometry in
                        geometry.frame(in: .named("player-reward"))
                    } action: { frame in
                        onActionFrameChange(frame)
                    }
            }
        }
        // The existing timeline occupies 36 pt above the action; silent stages have no timeline.
        // Reserve the remaining receipt/travel area permanently so text never moves on awards.
        .padding(.top, LearningRewardView.clearanceHeight - 16 - (session.isSilent ? 0 : 36))
        .padding()
        .animation(reduceMotion ? nil : .easeInOut(duration: 0.22), value: session.showsThirdCycleChoices)
    }
    private func symbol(_ action: LearningEvent?) -> String {
        switch action { case .resume: "play.fill"; case .next: "forward.fill"; case .confirm: "checkmark"; default: "waveform" }
    }
    private func label(_ action: LearningEvent?) -> String {
        switch action { case .resume: String(localized: "학습 이어하기"); case .next: String(localized: "다음 학습"); case .confirm: String(localized: "학습 확인"); default: String(localized: "재생 중") }
    }
}
struct CycleTimelineView: View {
    let session: LearningSession
    let motion: LearningMotionState
    var body: some View {
        GeometryReader { geometry in
            ScrollViewReader { scroll in
                ScrollView(.horizontal) {
                    // Legacy checkpoints may contain more cycles than fit on screen.
                    LazyHStack(spacing: 0) {
                        ForEach(0..<session.current.planned, id: \.self) { ordinal in
                            HStack(spacing: 4) {
                                node(.make(session: session, ordinal: ordinal, position: motion.position))
                                    // Strokes extend beyond their path; retain clearance inside the clipped strip.
                                    .padding(2)
                                    .frame(width: 24, height: 24)
                                if ordinal + 1 < session.current.planned {
                                    Rectangle().fill(ordinal < session.current.confirmed ? BrandStyle.green : Color.secondary.opacity(0.2))
                                        .frame(height: 2).padding(.trailing, 4)
                                }
                            }
                            .frame(width: ordinal + 1 == session.current.planned ? 24
                                : max(44, (geometry.size.width - 24) / CGFloat(min(session.current.planned, 5) - 1)))
                            .id(ordinal)
                        }
                    }
                }.scrollIndicators(.hidden)
                    .onChange(of: session.current.confirmed, initial: true) { _, confirmed in
                        scroll.scrollTo(min(confirmed, session.current.planned - 1), anchor: .center)
                    }
            }
        }.frame(height: 24)
            .accessibilityElement(children: .ignore)
            .accessibilityLabel("확인한 반복 \(session.current.confirmed)/\(session.current.planned)")
            .accessibilityValue(session.phase == .speaking ? "재생 완료, 확인 대기" : "")
            .accessibilityIdentifier("cycle-timeline")
            .playerLayoutFrame("cycle-timeline")
    }
    @ViewBuilder private func node(_ state: LearningCyclePresentation) -> some View {
        switch state {
        case .confirmed: Image(systemName: "checkmark.circle.fill").resizable().foregroundStyle(BrandStyle.green)
        case .pending: Circle().stroke(.secondary.opacity(0.3), lineWidth: 2)
        case let .active(progress):
            Circle().stroke(.secondary.opacity(0.3), lineWidth: 2)
                .overlay {
                    Circle().trim(from: 0, to: progress).stroke(BrandStyle.green, style: StrokeStyle(lineWidth: 3, lineCap: .round))
                        .rotationEffect(.degrees(-90))
                }
        }
    }
}
