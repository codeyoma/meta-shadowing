import LearningDomain
import LearningMedia
import SwiftUI

struct LearningControlsView: View {
    let runtime: NativeLearningRuntime
    let onActionFrameChange: (CGRect) -> Void
    var compact = false
    var compactOnLeft = false
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    // Different SF Symbols must not move the footer when playback changes state.
    @ScaledMetric(relativeTo: .body) private var actionSymbolHeight = 20.0
    var body: some View {
        let controls = runtime.controls, session = controls.session
        VStack(spacing: 12) {
            if !session.isSilent {
                CycleTimelineView(session: session, motion: runtime.motion, compact: compact)
                    .frame(maxWidth: compact ? .infinity : nil, alignment: compactOnLeft ? .leading : .trailing)
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
                if compact && compactOnLeft {
                    mainButton
                    repeatButton
                } else {
                    repeatButton
                    mainButton
                }
            }
            .frame(maxWidth: .infinity, alignment: compact ? (compactOnLeft ? .leading : .trailing) : .center)
        }
        // Reward toasts overlay content; no permanent feedback slot is needed above the cycles.
        .padding(.horizontal, compact ? 0 : 16)
        .padding(.bottom, compact ? 0 : 16)
        .padding(.top, compact ? 0 : 4)
        .animation(reduceMotion ? nil : .easeInOut(duration: 0.22), value: session.showsThirdCycleChoices)
    }
    @ViewBuilder private var repeatButton: some View {
        let controls = runtime.controls, session = controls.session
        if session.showsThirdCycleChoices || session.canRepeat {
            Button { Task { _ = await runtime.coordinator.perform(.repeat) } } label: {
                Image(systemName: "repeat").frame(maxWidth: compact ? nil : .infinity)
                    .frame(height: compact ? 20 : actionSymbolHeight)
            }.modifier(LearningActionStyle(compact: compact, primary: false))
                .accessibilityLabel("두 번 더 연습하기").accessibilityIdentifier("player-repeat")
                .disabled(!controls.repeatable).frame(maxWidth: compact ? 44 : 80)
                .accessibilityShowsLargeContentViewer()
        }
    }
    private var mainButton: some View {
        let controls = runtime.controls
        return Button {
            if let action = runtime.controls.mainAction { Task { _ = await runtime.coordinator.perform(action) } }
        } label: {
            Image(systemName: symbol(controls.mainAction))
                .frame(maxWidth: compact ? nil : .infinity)
                .frame(height: compact ? 20 : actionSymbolHeight)
        }.accessibilityLabel(label(controls.mainAction))
            .accessibilityIdentifier("player-main")
            .disabled(controls.mainAction == nil)
            .modifier(LearningActionStyle(compact: compact, primary: true))
            .accessibilityShowsLargeContentViewer()
            .playerLayoutFrame("player-main")
            .onGeometryChange(for: CGRect.self) { geometry in
                geometry.frame(in: .named("player-reward"))
            } action: { frame in onActionFrameChange(frame) }
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
    var compact = false
    var body: some View {
        Group {
            if compact {
                // Keep the active cycle visible even in a historical run with more than five passes.
                let first = min(max(0, session.current.confirmed - 2), max(0, session.current.planned - 5))
                HStack(spacing: 6) {
                    ForEach(first..<min(first + 5, session.current.planned), id: \.self) { ordinal in
                        node(.make(session: session, ordinal: ordinal, position: motion.position))
                            .padding(2).frame(width: 18, height: 18)
                    }
                }
                .padding(4).background(.black.opacity(0.5), in: .capsule)
            } else {
                expandedTimeline
            }
        }
        .frame(height: compact ? 26 : 24)
        .accessibilityElement(children: .ignore)
        .accessibilityLabel("확인한 반복 \(session.current.confirmed)/\(session.current.planned)")
        .accessibilityValue(session.phase == .speaking ? "재생 완료, 확인 대기" : "")
        .accessibilityIdentifier("cycle-timeline")
        .playerLayoutFrame("cycle-timeline")
    }
    private var expandedTimeline: some View {
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

private struct LearningActionStyle: ViewModifier {
    let compact: Bool
    let primary: Bool
    func body(content: Content) -> some View {
        if compact {
            content.buttonStyle(CompactLearningActionStyle(primary: primary))
        } else if primary {
            content.buttonStyle(.floatingPrimaryAction)
        } else {
            content.buttonStyle(.glass).buttonBorderShape(.capsule).controlSize(.large)
        }
    }
}

private struct CompactLearningActionStyle: ButtonStyle {
    let primary: Bool
    @Environment(\.isEnabled) private var enabled
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .font(.system(size: 20, weight: .semibold))
            .frame(width: primary ? 60 : 44, height: primary ? 60 : 44)
            .foregroundStyle(primary ? BrandStyle.ink : .white)
            .background(primary ? BrandStyle.yellow : Color.black.opacity(0.6), in: .circle)
            .overlay { Circle().strokeBorder(.white.opacity(primary ? 0.15 : 0.5), lineWidth: 1) }
            .opacity(enabled ? 1 : 0.5)
            .scaleEffect(!reduceMotion && configuration.isPressed ? 0.94 : 1)
            .animation(reduceMotion ? nil : .easeOut(duration: 0.15), value: configuration.isPressed)
            .contentShape(.circle)
    }
}
