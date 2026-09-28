import AppFoundation
import LearningDomain
import SwiftUI

extension LearningOptionRoute {
    var title: String {
        switch self {
        case .menu: "학습 옵션"; case .rate: "배속"; case .group: "다구간 학습 사이즈"
        case .revealSpeed: "크레이지 스피킹"; case .display: "학습 화면"; case .typography: "폰트 설정"
        case .sentences: "전체 문장"; case .guide: "학습 안내"; case .analysis: "문장 분석"
        }
    }
    static let preferences: [Self] = [.display, .typography, .rate, .group, .revealSpeed]
}
struct LearningPreferencesView: View {
    let model: ProductModel
    var body: some View {
        List(LearningOptionRoute.preferences) { option in
            NavigationLink(option.title) {
                PreferenceEditorView(option: option, initial: model.snapshot?.preferences.learning ?? .fresh) { value in
                    await model.saveLearningPreferences(value)
                    return !model.failed
                }
            }
        }.navigationTitle("학습 설정")
    }
}
struct PreferenceEditorView: View {
    let option: LearningOptionRoute
    let save: (LearningPreferences) async -> Bool
    @State private var value: LearningPreferences
    @State private var committed: LearningPreferences
    @State private var saving = false
    @State private var failed = false
    init(option: LearningOptionRoute, initial: LearningPreferences, save: @escaping (LearningPreferences) async -> Bool) {
        self.option = option; self.save = save
        value = initial; committed = initial
    }
    var body: some View {
        Form {
            if failed { Text("저장하지 못했어요. 다시 변경해 주세요.").foregroundStyle(.red) }
            switch option {
            case .typography:
                TypographyEditorView(value: value, change: commit)
            case .rate:
                RateEditorView(rate: value.rate) { rate in var next = value; next.rate = rate; commit(next) }
            case .group:
                Picker("학습 묶음", selection: Binding(get: { value.groupSize }, set: { size in
                    var next = value; next.groupSize = size; commit(next)
                })) { ForEach(2...4, id: \.self) { Text("\($0)구간").tag($0) } }.pickerStyle(.segmented)
                Text("진행 중인 학습은 학습 옵션에서 별도로 바꿀 수 있어요.").font(.footnote)
            case .revealSpeed:
                RevealSpeedEditorView(values: value.revealWPM) { speeds in
                    var next = value; next.revealWPM = speeds; commit(next)
                }
            case .display:
                Picker("학습 화면", selection: Binding(get: { value.speechView }, set: { style in
                    var next = value; next.speechView = style; commit(next)
                })) {
                    Text("버블로 보기").tag("bubble")
                    Text("리스트로 보기").tag("list")
                }.pickerStyle(.segmented)
                TypographyPreview(value: value)
            default: EmptyView()
            }
        }.navigationTitle(option.title).disabled(saving)
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
