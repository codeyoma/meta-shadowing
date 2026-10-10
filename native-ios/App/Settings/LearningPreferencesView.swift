import AppFoundation
import LearningDomain
import SwiftUI

extension LearningOptionRoute {
    var title: String {
        switch self {
        case .fullscreenTypography: String(localized: "전체화면 폰트 설정")
        case .menu: String(localized: "학습 옵션"); case .rate: String(localized: "배속"); case .group: String(localized: "다구간 학습 사이즈")
        case .revealSpeed: String(localized: "단어 공개 속도"); case .revealPresets: String(localized: "크레이지 스피킹")
        case .display: String(localized: "학습 화면"); case .typography: String(localized: "폰트 설정")
        case .sentences: String(localized: "전체 문장"); case .guide: String(localized: "학습 안내"); case .analysis: String(localized: "문장 분석")
        }
    }
    static let preferences: [Self] = [.display, .typography, .rate, .group, .revealPresets]
    func summary(preferences value: LearningPreferences) -> String {
        switch self {
        case .display:
            return value.speechView == "bubble" ? String(localized: "버블로 보기") : String(localized: "리스트로 보기")
        case .typography:
            let original = LearningFont.title(value.originalTextFont)
            let translation = LearningFont.title(value.translationTextFont)
            let originalSize = LearningFont.baseSize(original: true, preferences: value)
            let translationSize = LearningFont.baseSize(original: false, preferences: value)
            return String(localized: "원문 \(original) \(originalSize) · 번역 \(translation) \(translationSize)")
        case .rate: return "\(value.rate.formatted())×"
        case .group: return String(localized: "\(value.groupSize)구간")
        case .revealPresets, .revealSpeed:
            return value.revealWPM.enumerated().map { "S\($0.offset + 1) \($0.element)" }.joined(separator: " · ") + " WPM"
        default: return ""
        }
    }
}
struct LearningPreferencesView: View {
    let model: ProductModel
    var body: some View {
        let preferences = model.snapshot?.preferences.learning ?? .fresh
        List(LearningOptionRoute.preferences) { option in
            let summary = option.summary(preferences: preferences)
            NavigationLink {
                PreferenceEditorView(option: option, preferences: preferences) { value in
                    await model.saveLearningPreferences(value)
                }
            } label: {
                LearningOptionLabel(title: option.title, summary: summary)
            }.accessibilityLabel(option.title).accessibilityValue(summary)
        }.navigationTitle("학습 설정")
    }
}
struct LearningOptionLabel: View {
    let title: String
    let summary: String
    var body: some View {
        VStack(alignment: .leading, spacing: 4) {
            Text(title)
            Text(summary).font(.footnote).foregroundStyle(.secondary)
                .fixedSize(horizontal: false, vertical: true)
        }
    }
}
struct PreferenceEditorView: View {
    let option: LearningOptionRoute
    let preferences: LearningPreferences
    let videoLayout: Bool
    let compact: Bool
    let save: (LearningPreferences) async -> Bool
    @State private var value: LearningPreferences
    @State private var committed: LearningPreferences
    @State private var saving = false
    @State private var failed = false
    init(option: LearningOptionRoute, preferences: LearningPreferences, videoLayout: Bool = false, compact: Bool = false, save: @escaping (LearningPreferences) async -> Bool) {
        self.option = option; self.preferences = preferences; self.save = save
        self.videoLayout = videoLayout
        self.compact = compact
        value = preferences; committed = preferences
    }
    var body: some View {
        Group {
            if compact {
                ScrollView {
                    VStack(alignment: .leading, spacing: 12) {
                        if failed { Text("저장하지 못했어요. 다시 변경해 주세요.").foregroundStyle(.red) }
                        compactControls
                    }.padding(16)
                }.scrollBounceBehavior(.basedOnSize)
            } else { fullForm }
        }.navigationTitle(option.title).disabled(saving)
            .onChange(of: preferences) { _, updated in
                // A coordinator retry can commit outside this editor's save task.
                value = updated; committed = updated; failed = false
            }
    }
    @ViewBuilder private var compactControls: some View {
        switch option {
        case .rate:
            RateEditorView(rate: value.rate) { rate in var next = value; next.rate = rate; commit(next) }
        case .group:
            Picker("학습 묶음", selection: Binding(get: { value.groupSize }, set: { size in
                var next = value; next.groupSize = size; commit(next)
            })) { ForEach(2...4, id: \.self) { Text("\($0)구간").tag($0) } }.pickerStyle(.segmented)
        case .typography, .fullscreenTypography:
            TypographyEditorView(value: value, videoLayout: videoLayout,
                                 fullscreenSizes: option == .fullscreenTypography, compact: true, change: commit)
        default: EmptyView()
        }
    }
    private var fullForm: some View {
        Form {
            if failed { Text("저장하지 못했어요. 다시 변경해 주세요.").foregroundStyle(.red) }
            switch option {
            case .typography:
                TypographyEditorView(value: value, videoLayout: videoLayout, change: commit)
            case .fullscreenTypography:
                TypographyEditorView(value: value, videoLayout: true, fullscreenSizes: true, change: commit)
            case .rate:
                RateEditorView(rate: value.rate) { rate in var next = value; next.rate = rate; commit(next) }
            case .group:
                Picker("학습 묶음", selection: Binding(get: { value.groupSize }, set: { size in
                    var next = value; next.groupSize = size; commit(next)
                })) { ForEach(2...4, id: \.self) { Text("\($0)구간").tag($0) } }.pickerStyle(.segmented)
                Text("진행 중인 학습은 학습 옵션에서 별도로 바꿀 수 있어요.").font(.footnote)
            case .revealSpeed, .revealPresets:
                RevealSpeedEditorView(values: value.revealWPM) { speeds in
                    var next = value; next.revealWPM = speeds; commit(next)
                }
            case .display:
                if videoLayout {
                    Text("동영상은 리스트로 표시돼요.").font(.footnote)
                } else {
                    Picker("학습 화면", selection: Binding(get: { value.speechView }, set: { style in
                        var next = value; next.speechView = style; commit(next)
                    })) {
                        Text("버블로 보기").tag("bubble")
                        Text("리스트로 보기").tag("list")
                    }.pickerStyle(.segmented)
                }
                TypographyPreview(value: value, videoLayout: videoLayout)
                    .listRowBackground(Color.clear).listRowSeparator(.hidden)
            default: EmptyView()
            }
        }
    }
    private func commit(_ next: LearningPreferences) {
        guard !saving else { return }
        value = next; saving = true; failed = false
        Task {
            if await save(next) { committed = next }
            else { value = committed; failed = true }
            saving = false
        }
    }
}
