import LearningDomain
import SwiftUI

/// Shared by settings previews and the player. A translation stays with its utterance.
struct LearningTextLayout<Item: Identifiable, Content: View>: View {
    let items: [Item]
    let speechView: String
    let identifierPrefix: String
    @ViewBuilder let content: (Item) -> Content

    var body: some View {
        let bubble = speechView == "bubble"
        let utterances = VStack(alignment: .leading, spacing: 24) {
            ForEach(Array(items.enumerated()), id: \.element.id) { ordinal, item in
                let trailing = !ordinal.isMultiple(of: 2)
                content(item)
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .fixedSize(horizontal: false, vertical: true)
                    .padding(bubble ? 16 : 0)
                    .background {
                        if bubble {
                            RoundedRectangle(cornerRadius: 20)
                                .fill(trailing ? Color.accentColor.opacity(0.14) : Color(uiColor: .secondarySystemGroupedBackground))
                        }
                    }
                    .accessibilityElement(children: .contain)
                    .accessibilityIdentifier("\(identifierPrefix)-\(bubble ? "bubble" : "paragraph")-\(item.id)")
                    .padding(bubble ? (trailing ? .leading : .trailing) : [], bubble ? 32 : 0)
            }
        }.frame(maxWidth: .infinity, alignment: .leading)
        if bubble {
            utterances
        } else {
            utterances.padding(16)
                .background(Color(uiColor: .secondarySystemGroupedBackground), in: .rect(cornerRadius: 20))
                .accessibilityElement(children: .contain)
                .accessibilityIdentifier("\(identifierPrefix)-list-card")
        }
    }
}

extension LearningPreferences {
    /// A presentation-only override; never save this copy back to the profile.
    func displayedForVideo(_ video: Bool, fullscreen: Bool = false) -> Self {
        var result = self
        if video { result.speechView = "list" }
        if fullscreen {
            result.originalTextSize = fullscreenOriginalTextSize
            result.translationTextSize = fullscreenTranslationTextSize
        }
        return result
    }
}

struct LearningTextFont: ViewModifier {
    let preferences: LearningPreferences
    let original: Bool
    @ScaledMetric(relativeTo: .body) private var scale = 1.0

    func body(content: Content) -> some View {
        let size = LearningFont.baseSize(original: original, preferences: preferences)
        let font = original ? preferences.originalTextFont : preferences.translationTextFont
        content.font(LearningFont.make(font, size: CGFloat(size) * scale))
    }
}
