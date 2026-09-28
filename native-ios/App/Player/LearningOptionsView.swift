import AppFoundation
import LearningMedia
import LearningDomain
import SwiftUI

struct LearningOptionsView: View {
    let flow: LearningFlow
    let model: ProductModel
    let initial: LearningOptionRoute
    let exit: () async -> Void
    @State private var path: [LearningOptionRoute]
    init(flow: LearningFlow, model: ProductModel, initial: LearningOptionRoute, exit: @escaping () async -> Void) {
        self.flow = flow; self.model = model; self.initial = initial; self.exit = exit
        path = initial == .menu ? [] : [initial]
    }
    var body: some View {
        NavigationStack(path: $path) {
            List {
                if let runtime = flow.runtime {
                    Section {
                        NavigationLink("전체 문장", value: LearningOptionRoute.sentences)
                        if runtime.controls.session.isSilent {
                            NavigationLink("단어 공개 속도", value: LearningOptionRoute.revealSpeed)
                        } else { NavigationLink("배속", value: LearningOptionRoute.rate) }
                        NavigationLink("다구간 학습 사이즈", value: LearningOptionRoute.group)
                        NavigationLink("크레이지 스피킹", value: LearningOptionRoute.revealPresets)
                        NavigationLink("학습 화면", value: LearningOptionRoute.display)
                        NavigationLink("폰트 설정", value: LearningOptionRoute.typography)
                    }
                    Section {
                        if runtime.monitorState == .monitoring {
                            Slider(value: Binding(get: { runtime.monitorGain }, set: { runtime.monitoring.setGain($0) }), in: 0...1)
                                .accessibilityLabel("내 목소리 크기")
                            Button("내 목소리 모니터링 끄기") { Task { await runtime.monitoring.setEnabled(false) } }
                        } else { Text("유선 헤드폰을 연결하면 학습 화면에서 내 목소리를 들을 수 있어요.").font(.footnote) }
                    }
                }
            }.navigationTitle("학습 옵션")
                .navigationDestination(for: LearningOptionRoute.self) { route in destination(route) }
                .toolbar {
                    ToolbarItem(placement: .confirmationAction) {
                        Button("닫기") { flow.dismissOptions() }.accessibilityIdentifier("options-close")
                    }
                }
        }
        .safeAreaInset(edge: .bottom) {
            VStack {
                if let runtime = flow.runtime, runtime.controls.saveFailed {
                    Text("저장하지 못했어요.").foregroundStyle(.red)
                    Button("저장 다시 시도") { Task { _ = await runtime.coordinator.retrySave() } }
                        .accessibilityIdentifier("options-save-retry")
                }
                Button { Task { await exit() } } label: {
                    Text("스테이지로 돌아가기").frame(maxWidth: .infinity, minHeight: 44)
                }.buttonStyle(.bordered)
                Button { flow.dismissOptions() } label: {
                    Text("학습 이어하기").frame(maxWidth: .infinity, minHeight: 44)
                }.buttonStyle(.borderedProminent)
            }.padding().frame(maxWidth: .infinity).background(.bar)
        }
        .presentationDragIndicator(.visible)
    }
    @ViewBuilder private func destination(_ route: LearningOptionRoute) -> some View {
        if let runtime = flow.runtime {
            switch route {
            case .sentences: AllSentencesView(flow: flow, session: runtime.controls.session)
            case .guide: LearningGuideView(stage: runtime.controls.session.plan.scope.stage)
            case .analysis: ServiceUnavailableView(title: "문장 분석", ticket: "#97")
            case .revealSpeed:
                preferenceEditor(.revealSpeed, runtime: runtime)
                    .safeAreaInset(edge: .top) { revealSelection(runtime) }
            default: preferenceEditor(route, runtime: runtime)
            }
        }
    }
    private func preferenceEditor(_ route: LearningOptionRoute, runtime: NativeLearningRuntime) -> some View {
        PreferenceEditorView(option: route, preferences: activePreferences(runtime)) { value in
            switch route {
            case .rate:
                let result = await runtime.coordinator.editWhilePaused(.changeRate(value.rate))
                return !result.controller.saveFailed && result.controller.snapshot.session.rate == value.rate
            case .group where (7...10).contains(runtime.controls.session.plan.scope.stage):
                let result = await runtime.coordinator.editWhilePaused(.regroup(size: value.groupSize, newPlanID: UUID().uuidString))
                return !result.controller.saveFailed && result.controller.snapshot.session.plan.groupSize == value.groupSize
            default:
                var global = model.snapshot?.preferences.learning ?? .fresh
                switch route {
                case .group: global.groupSize = value.groupSize
                case .revealSpeed, .revealPresets: global.revealWPM = value.revealWPM
                default:
                    global.speechView = value.speechView
                    global.originalTextFont = value.originalTextFont; global.translationTextFont = value.translationTextFont
                    global.originalTextSize = value.originalTextSize; global.translationTextSize = value.translationTextSize
                }
                return await model.saveLearningPreferences(global)
            }
        }.disabled(runtime.controls.saveFailed)
    }
    private func revealSelection(_ runtime: NativeLearningRuntime) -> some View {
        let presets = LearningRevealSpeedDraft.normalized(model.snapshot?.preferences.learning.revealWPM ?? [150, 200, 250, 300])
        return VStack(alignment: .leading, spacing: 8) {
            if let reveal = runtime.controls.session.reveal {
                Text("현재 S\(reveal.level) · \(reveal.WPM) WPM")
                    .accessibilityIdentifier("active-reveal-speed")
                HStack {
                    ForEach(1...4, id: \.self) { level in
                        let selected = reveal.level == level && reveal.WPM == presets[level - 1]
                        Button {
                            Task {
                                guard !model.busy else { return }
                                let committed = LearningRevealSpeedDraft.normalized(model.snapshot?.preferences.learning.revealWPM ?? [150, 200, 250, 300])
                                _ = await runtime.coordinator.editWhilePaused(.changeRevealSpeed(level: level, presets: committed))
                            }
                        } label: {
                            HStack {
                                Text("S\(level)")
                                if selected {
                                    Image(systemName: "checkmark").accessibilityHidden(true)
                                }
                            }.frame(maxWidth: .infinity, minHeight: 44)
                        }.accessibilityIdentifier("active-reveal-level-\(level)")
                            .accessibilityAddTraits(selected ? .isSelected : [])
                    }
                }.buttonStyle(.bordered)
                Text("기본 WPM을 바꾼 뒤 S1–S4를 선택하면 현재 학습에 적용돼요.").font(.footnote)
            }
        }.padding().background(.bar).disabled(runtime.controls.saveFailed || model.busy)
    }
    private func activePreferences(_ runtime: NativeLearningRuntime) -> LearningPreferences {
        var value = model.snapshot?.preferences.learning ?? .fresh
        value.rate = runtime.controls.session.rate
        if (7...10).contains(runtime.controls.session.plan.scope.stage) { value.groupSize = runtime.controls.session.plan.groupSize }
        return value
    }
}
