import AppFoundation
import SwiftUI

struct RevealSpeedEditorView: View {
    let values: [Int]
    let change: ([Int]) -> Void
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
        }
        Text("S1은 100–200 WPM에서 25씩, 이후 단계는 이전 단계보다 50·100·150 WPM 빠르게 설정해요. 이후 단계의 간격은 유지돼요.")
            .font(.footnote)
        Text("기본값을 바꾸어도 진행 중인 학습 속도는 변하지 않아요.").font(.footnote)
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
