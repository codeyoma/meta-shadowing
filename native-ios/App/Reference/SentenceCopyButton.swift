import SwiftUI
import UIKit

struct SentenceCopyButton: View {
    let text: String
    @State private var copied = false
    @State private var feedback: Task<Void, Never>?
    var body: some View {
        Button {
            UIPasteboard.general.string = text
            feedback?.cancel(); copied = true
            feedback = Task {
                do { try await Task.sleep(for: .milliseconds(1500)); copied = false }
                catch { }
            }
        } label: {
            Image(systemName: copied ? "checkmark" : "doc.on.doc").frame(minWidth: 44, minHeight: 44)
        }.accessibilityLabel(copied ? "복사됨" : "원문 복사")
            .accessibilityIdentifier("analysis-copy")
            .onDisappear { feedback?.cancel(); feedback = nil; copied = false }
    }
}
