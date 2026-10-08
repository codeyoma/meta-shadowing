import AppFoundation
import LearningDomain
import SwiftUI

struct RevealSpeedEditorView: View {
    let values: [Int]
    let change: ([Int]) -> Void
    @State private var resetGeneration = 0
    var body: some View {
        let displayed = LearningRevealSpeedDraft.normalized(values)
        Section("단어 공개 속도 (WPM)") {
            ForEach(0..<4, id: \.self) { index in
                let bounds = LearningRevealSpeedDraft.editBounds(values, index: index)
                RevealPresetRow(level: index + 1, value: displayed[index], range: bounds.range,
                                step: bounds.step) { value in
                    let updated = LearningRevealSpeedDraft.changing(values, index: index, value: value)
                    change(updated)
                    return updated[index]
                }
            }
        }.id(resetGeneration)
        Section {
            Button("초기화") {
                change(LearningPreferences.fresh.revealWPM)
                // Replace draft/focus state even when saved values already equal the defaults.
                resetGeneration += 1
            }.accessibilityIdentifier("reveal-presets-reset")
        }
    }
}
private struct RevealPresetRow: View {
    let level: Int
    let value: Int
    let range: ClosedRange<Int>
    let step: Int
    let change: (Int) -> Int
    @State private var draft: String
    @FocusState private var focused: Bool
    init(level: Int, value: Int, range: ClosedRange<Int>, step: Int, change: @escaping (Int) -> Int) {
        self.level = level; self.value = value; self.range = range; self.step = step; self.change = change
        draft = String(value)
    }
    var body: some View {
        HStack {
            Text("S\(level)")
            TextField("WPM", text: $draft).keyboardType(.numberPad).focused($focused)
                .multilineTextAlignment(.trailing).monospacedDigit().onSubmit(commit)
                .accessibilityIdentifier("reveal-wpm-\(level)")
            Stepper("S\(level)", value: Binding(get: { value }, set: { focused = false; draft = String(change($0)) }),
                    in: range, step: step)
                .labelsHidden()
                .accessibilityIdentifier("reveal-wpm-\(level)-stepper")
        }
        .onChange(of: value) { _, new in draft = String(new) }
        .onChange(of: focused) { _, active in if !active { commit() } }
        .toolbar { if focused { ToolbarItemGroup(placement: .keyboard) { Spacer(); Button("완료") { focused = false } } } }
    }
    private func commit() {
        if let speed = LearningRevealSpeedDraft.validWPM(draft), speed != value { draft = String(change(speed)) }
        else { draft = String(value) }
    }
}
