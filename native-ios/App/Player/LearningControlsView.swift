import LearningDomain
import LearningMedia
import SwiftUI

struct LearningControlsView: View {
    let runtime: NativeLearningRuntime
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
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
                    Button { Task { _ = await runtime.coordinator.perform(.repeat) } } label: {
                        Image(systemName: "repeat").frame(maxWidth: .infinity)
                    }.accessibilityLabel("두 번 더 연습하기").accessibilityIdentifier("player-repeat")
                        .disabled(!controls.repeatable).frame(maxWidth: 80)
                }
                Button {
                    if let action = runtime.controls.mainAction { Task { _ = await runtime.coordinator.perform(action) } }
                } label: {
                    Image(systemName: controls.mainAction == .resume ? "play.fill" : "checkmark")
                        .frame(maxWidth: .infinity)
                }.accessibilityLabel(label(controls.mainAction)).accessibilityIdentifier("player-main")
                    .disabled(controls.mainAction == nil)
            }.buttonStyle(LearningActionStyle())
        }.padding().background(.bar)
            .animation(reduceMotion ? nil : .easeInOut(duration: 0.22), value: session.showsThirdCycleChoices)
    }
    private func label(_ action: LearningEvent?) -> String {
        switch action { case .resume: "학습 이어하기"; case .next: "다음 학습"; case .confirm: "학습 확인"; default: "재생 중" }
    }
}
private struct CycleTimelineView: View {
    let session: LearningSession
    let motion: LearningMotionState
    var body: some View {
        HStack {
            ForEach(0..<session.current.planned, id: \.self) { ordinal in
                Image(systemName: ordinal < session.current.confirmed ? "checkmark.circle.fill" : "circle")
                    .foregroundStyle(ordinal < session.current.confirmed ? BrandStyle.green : .secondary)
                if ordinal + 1 < session.current.planned { Rectangle().frame(height: 2).foregroundStyle(.quaternary) }
            }
        }.accessibilityElement(children: .ignore)
            .accessibilityLabel("확인한 반복 \(session.current.confirmed)/\(session.current.planned)")
            .accessibilityIdentifier("cycle-timeline")
            .overlay(alignment: .bottom) {
                if let position = motion.position, session.phase == .listening {
                    ProgressView(value: min(position.seconds, position.duration), total: max(0.001, position.duration))
                        .tint(BrandStyle.green).offset(y: 7).accessibilityHidden(true)
                }
            }
    }
}
