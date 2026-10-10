import AppFoundation
import LearningDomain
import SwiftUI

struct TypographyEditorView: View {
    let value: LearningPreferences
    var videoLayout = false
    var fullscreenSizes = false
    var compact = false
    let change: (LearningPreferences) -> Void
    @Environment(\.dynamicTypeSize) private var dynamicTypeSize
    var body: some View {
        if compact {
            VStack(alignment: .leading, spacing: 12) {
                originalControls
                Divider()
                translationControls
                Divider()
                resetControls
            }
        } else {
            if !fullscreenSizes { preview }
            Section("원문") { originalControls }
            Section("번역") { translationControls }
            Section { resetControls }
            // Landscape is short: put the editable settings before the long preview.
            if fullscreenSizes { preview }
        }
    }
    private var originalControls: some View {
        Group {
            fontPicker(original: true)
            TextSizeControl(title: String(localized: "원문 크기"), identifier: fullscreenSizes ? "fullscreen-original-size" : "original-size",
                            value: fullscreenSizes ? value.fullscreenOriginalTextSize : value.originalTextSize ?? 20,
                            compact: compact) { size in
                var next = value
                if fullscreenSizes { next.fullscreenOriginalTextSize = size } else { next.originalTextSize = size }
                change(next)
            }
        }
    }
    private var translationControls: some View {
        Group {
            fontPicker(original: false)
            TextSizeControl(title: String(localized: "번역 크기"), identifier: fullscreenSizes ? "fullscreen-translation-size" : "translation-size",
                            value: fullscreenSizes ? value.fullscreenTranslationTextSize : value.translationTextSize ?? 18,
                            compact: compact) { size in
                var next = value
                if fullscreenSizes { next.fullscreenTranslationTextSize = size } else { next.translationTextSize = size }
                change(next)
            }
        }
    }
    private var resetControls: some View {
        Group {
            Button("크기 초기화 (20 / 18)") {
                var next = value
                if fullscreenSizes { next.resetFullscreenTextSizes() } else { next.resetTextSizes() }
                change(next)
            }.frame(minHeight: compact ? 44 : nil)
            Button("폰트 초기화 (System)") { var next = value; next.resetFonts(); change(next) }
                .frame(minHeight: compact ? 44 : nil)
        }
    }
    @ViewBuilder private func fontPicker(original: Bool) -> some View {
        let title = original ? String(localized: "원문 폰트") : String(localized: "번역 폰트")
        let selected = original ? value.originalTextFont : value.translationTextFont
        let picker = Picker(selection: Binding(get: { selected ?? "system" }, set: { font in
            var next = value
            if original { next.originalTextFont = font } else { next.translationTextFont = font }
            change(next)
        })) {
            ForEach(LearningFont.choices, id: \.0) { Text($0.1).tag($0.0) }
        } label: { Text(compact ? "" : title) }
        .pickerStyle(.menu)
        .accessibilityValue(LearningFont.title(selected))
        .accessibilityIdentifier((fullscreenSizes ? "fullscreen-" : "") + (original ? "original-font" : "translation-font"))
        .frame(minHeight: compact ? 44 : nil)
        if compact {
            // The visible title and the picker's accessible name must not be announced twice.
            if dynamicTypeSize.isAccessibilitySize {
                VStack(alignment: .leading, spacing: 4) {
                    Text(title).accessibilityHidden(true)
                    picker.labelsHidden().accessibilityLabel(title)
                }
            } else {
                HStack {
                    Text(title).accessibilityHidden(true)
                    Spacer(minLength: 8)
                    picker.labelsHidden().accessibilityLabel(title)
                }
            }
        } else { picker }
    }
    private var preview: some View {
        Section("미리보기") {
            TypographyPreview(value: value.displayedForVideo(videoLayout, fullscreen: fullscreenSizes), videoLayout: videoLayout)
                .listRowBackground(Color.clear)
        }
    }
}
struct TextSizeControl: View {
    let title: String
    let identifier: String
    let value: Int
    let change: (Int) -> Void
    let compact: Bool
    @Environment(\.dynamicTypeSize) private var dynamicTypeSize
    @State private var draft: String
    @FocusState private var focused: Bool
    init(title: String, identifier: String, value: Int, compact: Bool = false, change: @escaping (Int) -> Void) {
        self.title = title; self.identifier = identifier; self.value = value; self.change = change; self.compact = compact
        draft = String(value)
    }
    var body: some View {
        Group {
            if compact && dynamicTypeSize.isAccessibilitySize {
                VStack(alignment: .leading, spacing: 8) {
                    Text(title)
                    HStack { field.frame(maxWidth: .infinity); stepper }
                }
            } else {
                HStack {
                    Text(title)
                    Spacer()
                    field.frame(minWidth: 44, maxWidth: 64)
                    stepper
                }
            }
        }
        .onChange(of: value) { _, new in draft = String(new) }
        .onChange(of: focused) { _, active in if !active { commit() } }
        .toolbar { if focused { ToolbarItemGroup(placement: .keyboard) { Spacer(); Button("완료") { focused = false } } } }
    }
    private var field: some View {
        TextField(title, text: $draft).keyboardType(.numberPad).multilineTextAlignment(.trailing)
            .monospacedDigit().focused($focused).accessibilityIdentifier(identifier).onSubmit(commit)
    }
    private var stepper: some View {
        Stepper(title, value: Binding(get: { value }, set: { focused = false; change($0) }), in: 12...48)
            .labelsHidden().accessibilityIdentifier("\(identifier)-stepper")
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
