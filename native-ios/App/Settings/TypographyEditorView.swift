import AppFoundation
import LearningDomain
import SwiftUI

struct TypographyEditorView: View {
    let value: LearningPreferences
    var videoLayout = false
    let change: (LearningPreferences) -> Void
    var body: some View {
        Section("미리보기") { TypographyPreview(value: value, videoLayout: videoLayout).listRowBackground(Color.clear) }
        Section("원문") {
            Picker("원문 폰트", selection: Binding(get: { value.originalTextFont ?? "system" }, set: { font in
                var next = value; next.originalTextFont = font; change(next)
            })) { ForEach(LearningFont.choices, id: \.0) { Text($0.1).tag($0.0) } }
                .accessibilityIdentifier("original-font")
            TextSizeControl(title: String(localized: "원문 크기"), identifier: "original-size", value: value.originalTextSize ?? 20) { size in
                var next = value; next.originalTextSize = size; change(next)
            }
        }
        Section("번역") {
            Picker("번역 폰트", selection: Binding(get: { value.translationTextFont ?? "system" }, set: { font in
                var next = value; next.translationTextFont = font; change(next)
            })) { ForEach(LearningFont.choices, id: \.0) { Text($0.1).tag($0.0) } }
                .accessibilityIdentifier("translation-font")
            TextSizeControl(title: String(localized: "번역 크기"), identifier: "translation-size", value: value.translationTextSize ?? 18) { size in
                var next = value; next.translationTextSize = size; change(next)
            }
        }
        Section {
            Button("크기 초기화 (20 / 18)") { var next = value; next.resetTextSizes(); change(next) }
            Button("폰트 초기화 (System)") { var next = value; next.resetFonts(); change(next) }
        }
    }
}
private struct TextSizeControl: View {
    let title: String
    let identifier: String
    let value: Int
    let change: (Int) -> Void
    @State private var draft: String
    @FocusState private var focused: Bool
    init(title: String, identifier: String, value: Int, change: @escaping (Int) -> Void) {
        self.title = title; self.identifier = identifier; self.value = value; self.change = change; draft = String(value)
    }
    var body: some View {
        HStack {
            Text(title)
            Spacer()
            TextField(title, text: $draft).keyboardType(.numberPad).multilineTextAlignment(.trailing)
                .monospacedDigit().frame(minWidth: 44, maxWidth: 64).focused($focused)
                .accessibilityIdentifier(identifier).onSubmit(commit)
            Stepper(title, value: Binding(get: { value }, set: { focused = false; change($0) }), in: 12...48)
                .labelsHidden()
                .accessibilityIdentifier("\(identifier)-stepper")
        }
        .onChange(of: value) { _, new in draft = String(new) }
        .onChange(of: focused) { _, active in if !active { commit() } }
        .toolbar { if focused { ToolbarItemGroup(placement: .keyboard) { Spacer(); Button("완료") { focused = false } } } }
    }
    private func commit() {
        if let size = LearningTypographyDraft.validSize(draft), size != value { change(size) }
        else { draft = String(value) }
    }
}
struct TypographyPreview: View {
    let value: LearningPreferences
    var videoLayout = false
    private struct Example: Identifiable {
        let id: String
        let original: LocalizedStringKey
        let translation: LocalizedStringKey
    }
    private let examples: [Example] = [
        .init(id: "0", original: "\"Every morning, I open the window and practice speaking English before breakfast.\"",
              translation: "\"매일 아침 창문을 열고 아침을 먹기 전에 영어 말하기를 연습해요.\""),
        .init(id: "1", original: "\"Little by little, these small moments of practice help me speak with more confidence.\"",
              translation: "\"이렇게 짧게 연습하는 시간이 쌓이면 조금씩 더 자신 있게 말할 수 있어요.\"")
    ]
    var body: some View {
        let displayPreferences = value.displayedForVideo(videoLayout)
        LearningTextLayout(items: examples, speechView: displayPreferences.speechView,
                           identifierPrefix: "settings-preview") { example in
            VStack(alignment: .leading, spacing: 12) {
                Text(example.original).modifier(LearningTextFont(preferences: displayPreferences, original: true))
                    .accessibilityIdentifier("settings-preview-original-\(example.id)")
                Text(example.translation).modifier(LearningTextFont(preferences: displayPreferences, original: false))
                    .accessibilityIdentifier("settings-preview-translation-\(example.id)")
            }
        }.padding(.vertical)
    }
}
