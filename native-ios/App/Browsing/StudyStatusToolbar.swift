import AppFoundation
import LearningDomain
import SwiftUI

enum StudyLanguage: String, CaseIterable, Identifiable {
    case english, japanese, chinese, german, spanish, french
    var id: String { rawValue }
    var title: String { switch self {
    case .english: String(localized: "영어"); case .japanese: String(localized: "일본어"); case .chinese: String(localized: "중국어")
    case .german: String(localized: "독일어"); case .spanish: String(localized: "스페인어"); case .french: String(localized: "프랑스어")
    } }
}

/// Language, level/XP and streak for the browsing screens' navigation bars.
struct StudyStatusToolbar: ToolbarContent {
    let language: StudyLanguage
    let progress: LanguageStudyProgress
    let disabled: Bool
    /// Pushed screens keep the back button in the leading slot.
    var includesLanguage = true
    let select: (StudyLanguage) -> Void
    var body: some ToolbarContent {
        if includesLanguage { languageMenu }
        ToolbarItem(placement: .topBarTrailing) {
            StudyStatusView(progress: progress)
        }.sharedBackgroundVisibility(.hidden)
    }
    private var languageMenu: some ToolbarContent {
        ToolbarItem(placement: .topBarLeading) {
            Menu {
                Picker("학습 언어", selection: Binding(get: { language }, set: { if $0 != language { select($0) } })) {
                    ForEach(StudyLanguage.allCases) { Text($0.title).tag($0) }
                }
            } label: {
                HStack(spacing: 4) {
                    Text(language.title)
                    Image(systemName: "chevron.down").font(.caption.bold()).accessibilityHidden(true)
                }
            }
            .disabled(disabled)
            .accessibilityLabel("학습 언어, \(language.title)")
            .accessibilityIdentifier("language-menu")
        }
    }
}

private struct StudyStatusView: View {
    let progress: LanguageStudyProgress
    var body: some View {
        HStack(spacing: 12) {
            HStack(spacing: 2) {
                Image(systemName: "flame.fill").foregroundStyle(progress.streak > 0 ? .orange : .secondary)
                Text(progress.streak, format: .number).monospacedDigit()
            }.font(.subheadline.bold())
                .accessibilityElement(children: .ignore)
                .accessibilityLabel("연속 학습 \(progress.streak)일")
            VStack(alignment: .trailing, spacing: 0) {
                Text("Lv. \(progress.level.level)").font(.caption.bold())
                Text(progress.level.maxLevel ? "MAX" : "\(progress.level.current) / \(progress.level.required) XP")
                    .font(.caption2).foregroundStyle(.secondary)
                    .accessibilityIdentifier("header-xp")
            }.monospacedDigit().fixedSize()
        }
        .accessibilityShowsLargeContentViewer {
            Label(progress.level.maxLevel
                  ? "Lv. \(progress.level.level) · MAX · 연속 \(progress.streak)일"
                  : "Lv. \(progress.level.level) · \(progress.level.current) / \(progress.level.required) XP · 연속 \(progress.streak)일",
                  systemImage: "flame.fill")
        }
    }
}
