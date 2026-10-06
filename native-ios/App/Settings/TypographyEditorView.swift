import AppFoundation
import LearningDomain
import SwiftUI

struct TypographyEditorView: View {
    let value: LearningPreferences
    let change: (LearningPreferences) -> Void
    private let fonts = [("system", "System"), ("rounded", "Rounded"), ("serif", "Serif"),
                         ("avenir-next", "Avenir Next"), ("georgia", "Georgia"), ("apple-sd-gothic-neo", "Apple SD Gothic Neo")]
    var body: some View {
        Section("미리보기") { TypographyPreview(value: value) }
        Section("원문") {
            Picker("원문 폰트", selection: Binding(get: { value.originalTextFont ?? "system" }, set: { font in
                var next = value; next.originalTextFont = font; change(next)
            })) { ForEach(fonts, id: \.0) { Text($0.1).tag($0.0) } }
            TextSizeControl(title: String(localized: "원문 크기"), identifier: "original-size", value: value.originalTextSize ?? 20) { size in
                var next = value; next.originalTextSize = size; change(next)
            }
        }
        Section("번역") {
            Picker("번역 폰트", selection: Binding(get: { value.translationTextFont ?? "system" }, set: { font in
                var next = value; next.translationTextFont = font; change(next)
            })) { ForEach(fonts, id: \.0) { Text($0.1).tag($0.0) } }
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
    @ScaledMetric(relativeTo: .body) private var scale = 1.0
    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            Text("One step at a time.").font(LearningFont.make(value.originalTextFont, size: CGFloat(value.originalTextSize ?? 20) * scale))
            Text("한 걸음씩 나아가요.").font(LearningFont.make(value.translationTextFont, size: CGFloat(value.translationTextSize ?? 18) * scale))
        }.padding(.vertical)
    }
}
