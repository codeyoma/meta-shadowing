import AppFoundation
import LearningDomain
import LearningMedia
import SwiftUI

struct LearningContentView: View {
    let session: LearningSession
    let motion: LearningMotionState
    let preferences: LearningPreferences
    @State private var originalVisible: Bool
    init(session: LearningSession, motion: LearningMotionState, preferences: LearningPreferences) {
        self.session = session; self.motion = motion; self.preferences = preferences
        originalVisible = ![5, 6, 9, 10].contains(session.plan.scope.stage)
    }
    var body: some View {
        if session.isSilent {
            SilentLearningContent(session: session, motion: motion, preferences: preferences)
        } else {
            VStack(alignment: .trailing, spacing: 8) {
                Toggle("자막 보기", isOn: $originalVisible).frame(minHeight: 44).toggleStyle(.switch)
                    .accessibilityIdentifier("subtitle-toggle")
                if let presentation = try? LearningUnitPresentation.make(session: session,
                    revealOriginal: originalVisible, elapsedSeconds: 0) {
                    LearningTextBlock(presentation: presentation, preferences: preferences)
                }
            }
        }
    }
}
private struct SilentLearningContent: View {
    let session: LearningSession
    let motion: LearningMotionState
    let preferences: LearningPreferences
    var body: some View {
        if let presentation = try? LearningUnitPresentation.make(session: session,
            revealOriginal: false, elapsedSeconds: motion.elapsedSeconds) {
            LearningTextBlock(presentation: presentation, preferences: preferences)
        }
    }
}
struct LearningTextBlock: View {
    let presentation: LearningUnitPresentation
    let preferences: LearningPreferences
    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            ForEach(presentation.lines) { line in
                LearningLineView(line: line, preferences: preferences)
                    .padding(.bottom, line.kind == .translation ? 12 : 0)
            }
        }.frame(maxWidth: .infinity, alignment: .leading).padding(20)
            .background(Color(uiColor: preferences.speechView == "bubble" ? .secondarySystemGroupedBackground : .tertiarySystemFill),
                        in: .rect(cornerRadius: preferences.speechView == "bubble" ? 24 : 8))
    }
}
private struct LearningLineView: View {
    let line: LearningTextLine
    let preferences: LearningPreferences
    @ScaledMetric(relativeTo: .body) private var scale = 1.0
    var body: some View {
        let target = line.kind == .target
        let base = target ? preferences.originalTextSize ?? (preferences.speechView == "bubble" ? 29 : 24)
                          : preferences.translationTextSize ?? (preferences.speechView == "bubble" ? 18 : 16)
        let font = target ? preferences.originalTextFont : preferences.translationTextFont
        ZStack(alignment: .topLeading) {
            Text(attributed).frame(maxWidth: .infinity, alignment: .leading)
            if let hint = line.hint { Text(hint) }
        }
        .font(LearningFont.make(font, size: CGFloat(base) * scale))
        .textSelection(.disabled)
        .accessibilityElement(children: .ignore).accessibilityLabel(line.accessibleText)
        .accessibilityHidden(line.accessibleText.isEmpty)
        .accessibilityIdentifier("learning-line-\(line.id)")
    }
    private var attributed: AttributedString {
        var result = AttributedString()
        for span in line.spans {
            var value = AttributedString(span.text)
            value.foregroundColor = span.visible ? Color.primary : Color.clear
            result.append(value)
        }
        return result
    }
}
