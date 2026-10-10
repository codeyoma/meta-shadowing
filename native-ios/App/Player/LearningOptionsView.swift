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
                        optionLink(.sentences, runtime: runtime)
                        ForEach(LearningOptionRoute.preferences) { option in
                            optionLink(option == .rate && runtime.controls.session.isSilent ? .revealSpeed : option,
                                       runtime: runtime)
                        }
                    }.disabled(runtime.controls.saveFailed || !runtime.controls.active || flow.accessInvalidated)
                    Section {
                        if runtime.monitorState == .monitoring || runtime.monitorState == .suspended {
                            Slider(value: Binding(get: { runtime.monitorGain }, set: { runtime.monitoring.setGain($0) }), in: VoiceMonitoring.gainRange)
                                .accessibilityLabel("내 목소리 크기")
                            Button("내 목소리 모니터링 끄기") { Task { await runtime.monitoring.setEnabled(false) } }
                        } else { Text("유선 헤드폰을 연결하면 학습 화면에서 내 목소리를 들을 수 있어요.").font(.footnote) }
                    }
                }
                Section {
                    // Also available while loading or after an error. Leaving never confirms learning.
                    Button { Task { await exit() } } label: {
                        Label("스테이지로 돌아가기", systemImage: "rectangle.portrait.and.arrow.right")
                    }.accessibilityIdentifier("options-exit")
                }
            }.navigationTitle("학습 옵션")
                .navigationDestination(for: LearningOptionRoute.self) { route in
                    destination(route).toolbar { closeButton }
                }
                .toolbar { closeButton }
        }
        // A failed save stays actionable on every page, outside the navigation stack.
        .safeAreaBar(edge: .bottom) {
            if let runtime = flow.runtime, runtime.controls.saveFailed {
                HStack {
                    Label("저장하지 못했어요.", systemImage: "exclamationmark.triangle.fill").symbolRenderingMode(.multicolor)
                    Spacer(minLength: 8)
                    Button("저장 다시 시도") { Task { _ = await runtime.coordinator.retrySave() } }
                        .buttonStyle(.glass).accessibilityIdentifier("options-save-retry")
                }.padding()
            }
        }
        .presentationDetents([.large])
        .presentationDragIndicator(.visible)
        .onChange(of: path) { old, new in
            if old.contains(.analysis), !new.contains(.analysis) { flow.leaveAnalysis() }
        }
        .onDisappear { flow.leaveAnalysis() }
    }
    private func optionLink(_ option: LearningOptionRoute, runtime: NativeLearningRuntime) -> some View {
        let summary: String
        switch option {
        case .sentences:
            summary = String(localized: "총 \(runtime.controls.session.plan.sources.count)문장")
        case .revealSpeed:
            let reveal = runtime.controls.session.reveal
            summary = "S\(reveal?.level ?? 1) · \(reveal?.WPM ?? 150) WPM"
        default:
            summary = option.summary(preferences: activePreferences(runtime).displayedForVideo(flow.video != nil))
        }
        return NavigationLink(value: option) {
            LearningOptionLabel(title: option.title, summary: summary)
        }.accessibilityLabel(option.title).accessibilityValue(summary)
    }
    /// The single dismiss control on every page. Swiping down dismisses as well.
    private var closeButton: some ToolbarContent {
        ToolbarItem(placement: .topBarTrailing) {
            Button(role: .close) { flow.dismissOptions() }.accessibilityIdentifier("options-close")
        }
    }
    @ViewBuilder private func destination(_ route: LearningOptionRoute) -> some View {
        if let runtime = flow.runtime {
            switch route {
            case .sentences: AllSentencesView(flow: flow, session: runtime.controls.session)
            case .guide: LearningGuideView(stage: runtime.controls.session.plan.scope.stage)
            case .analysis:
                AnalysisBrowserView(flow: flow)
                    .navigationBarBackButtonHidden(hasSingleAnalysisSentence)
                    .toolbar {
                        if hasSingleAnalysisSentence {
                            ToolbarItem(placement: .topBarLeading) {
                                Button("뒤로", systemImage: "chevron.backward") { flow.dismissOptions() }
                                    .labelStyle(.iconOnly).accessibilityIdentifier("BackButton")
                            }
                        }
                    }
            case .revealSpeed:
                preferenceEditor(.revealSpeed, runtime: runtime)
                    .safeAreaInset(edge: .top) { revealSelection(runtime) }
            default: preferenceEditor(route, runtime: runtime)
            }
        }
    }
    private var hasSingleAnalysisSentence: Bool {
        flow.analysis?.state == .ready && flow.analysis?.sentences.count == 1
    }
    private func preferenceEditor(_ route: LearningOptionRoute, runtime: NativeLearningRuntime) -> some View {
        let settings = LearningPreferenceSession(runtime: runtime, model: model)
        return PreferenceEditorView(option: route, preferences: settings.value, videoLayout: flow.video != nil) { value in
            await settings.save(value, for: route)
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
        LearningPreferenceSession(runtime: runtime, model: model).value
    }
}

/// Shared save boundary for the full options sheet and both player layouts' quick popovers.
struct LearningPreferenceSession {
    let runtime: NativeLearningRuntime
    let model: ProductModel

    var value: LearningPreferences {
        var value = model.snapshot?.preferences.learning ?? .fresh
        value.rate = runtime.controls.session.rate
        if (7...10).contains(runtime.controls.session.plan.scope.stage) { value.groupSize = runtime.controls.session.plan.groupSize }
        return value
    }

    func save(_ value: LearningPreferences, for route: LearningOptionRoute) async -> Bool {
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
            case .fullscreenTypography:
                global.originalTextFont = value.originalTextFont; global.translationTextFont = value.translationTextFont
                global.fullscreenOriginalTextSize = value.fullscreenOriginalTextSize
                global.fullscreenTranslationTextSize = value.fullscreenTranslationTextSize
            case .typography:
                global.originalTextFont = value.originalTextFont; global.translationTextFont = value.translationTextFont
                global.originalTextSize = value.originalTextSize; global.translationTextSize = value.translationTextSize
            case .group: global.groupSize = value.groupSize
            case .revealSpeed, .revealPresets: global.revealWPM = value.revealWPM
            default:
                global.speechView = value.speechView
                global.originalTextFont = value.originalTextFont; global.translationTextFont = value.translationTextFont
                global.originalTextSize = value.originalTextSize; global.translationTextSize = value.translationTextSize
            }
            return await model.saveLearningPreferences(global)
        }
    }
}
