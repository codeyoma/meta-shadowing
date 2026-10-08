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
    var flag: String { switch self {
    case .english: "🇬🇧"; case .japanese: "🇯🇵"; case .chinese: "🇨🇳"
    case .german: "🇩🇪"; case .spanish: "🇪🇸"; case .french: "🇫🇷"
    } }
    var abbreviation: String { switch self {
    case .english: "EN"; case .japanese: "JP"; case .chinese: "CN"
    case .german: "DE"; case .spanish: "ES"; case .french: "FR"
    } }
}

/// Language, level/XP and streak for the browsing screens' navigation bars.
struct StudyStatusToolbar: ToolbarContent {
    let language: StudyLanguage
    let progress: LanguageStudyProgress
    let disabled: Bool
    let select: (StudyLanguage) -> Void
    var body: some ToolbarContent {
        languageMenu
        ToolbarItem(placement: .topBarTrailing) {
            StudyStatusView(progress: progress)
        }.sharedBackgroundVisibility(.hidden)
    }
    private var languageMenu: some ToolbarContent {
        ToolbarItem(placement: .topBarLeading) {
            // Keep the badge in a fixed-size custom toolbar view.
            HStack(spacing: 0) {
                Menu {
                    Picker("학습 언어", selection: Binding(get: { language }, set: { if $0 != language { select($0) } })) {
                        ForEach(StudyLanguage.allCases) { language in
                            Text(verbatim: "\(language.flag)  \(language.title)").tag(language)
                        }
                    }
                } label: {
                    VStack(spacing: 0) {
                        Text(language.flag).font(.system(size: 20))
                        Text(language.abbreviation).font(.system(size: 10, weight: .bold))
                    }
                    .frame(width: 44, height: 44)
                    .fixedSize()
                    .contentShape(.circle)
                    .glassEffect(.regular.interactive(), in: .circle)
                }
                .menuIndicator(.hidden)
                .buttonStyle(.plain)
                .buttonBorderShape(.circle)
                .foregroundStyle(.primary)
                .frame(width: 44, height: 44)
                .contentShape(.circle)
                .fixedSize()
                .disabled(disabled)
                .accessibilityLabel("학습 언어, \(language.title)")
                .accessibilityIdentifier("language-menu")
                .accessibilityShowsLargeContentViewer { Text(language.title) }
            }.fixedSize()
        }.sharedBackgroundVisibility(.hidden)
    }
}

private struct StudyStatusView: View {
    let progress: LanguageStudyProgress
    @State private var showsExperience = false
    @ScaledMetric(relativeTo: .subheadline) private var symbolRowHeight = 24
    @ScaledMetric(relativeTo: .caption2) private var valueRowHeight = 14
    private var experienceText: String {
        progress.level.maxLevel ? String(localized: "MAX")
            : String(localized: "\(progress.level.current) / \(progress.level.required) XP")
    }
    var body: some View {
        HStack(spacing: 12) {
            Button { showsExperience = true } label: {
                VStack(spacing: 1) {
                    Text("Lv. \(progress.level.level)").font(.subheadline.bold())
                        .frame(height: symbolRowHeight)
                    ProgressView(value: Double(progress.level.current), total: Double(progress.level.required))
                        .progressViewStyle(.linear).tint(BrandStyle.yellow)
                        .frame(width: 68, height: valueRowHeight)
                }
                .monospacedDigit().frame(minHeight: 44).contentShape(.rect)
            }
            .buttonStyle(.plain)
            .accessibilityLabel(experienceText)
            .accessibilityValue(Text("Lv. \(progress.level.level)"))
            .accessibilityHint("현재 레벨의 경험치 보기")
            .accessibilityIdentifier("header-xp")
            .background {
                ExperiencePopover(isPresented: $showsExperience) { experienceDetails }
            }
            VStack(spacing: 1) {
                Image(systemName: "flame.fill").foregroundStyle(progress.streak > 0 ? .orange : .secondary)
                    .frame(height: symbolRowHeight)
                Text(progress.streak, format: .number).font(.caption2.bold()).monospacedDigit()
                    .frame(height: valueRowHeight)
            }
            .font(.subheadline.bold()).frame(minHeight: 44)
            .accessibilityElement(children: .ignore)
            .accessibilityLabel("연속 학습 \(progress.streak)일")
        }
        .accessibilityShowsLargeContentViewer {
            Label(progress.level.maxLevel
                  ? "Lv. \(progress.level.level) · MAX · 연속 \(progress.streak)일"
                  : "Lv. \(progress.level.level) · \(progress.level.current) / \(progress.level.required) XP · 연속 \(progress.streak)일",
                  systemImage: "flame.fill")
        }
    }
    private var experienceDetails: some View {
        VStack(alignment: .leading, spacing: 6) {
            Text("Lv. \(progress.level.level)").font(.caption).foregroundStyle(.secondary)
                .accessibilityIdentifier("header-xp-level")
            Text(experienceText).font(.headline).monospacedDigit()
                .accessibilityIdentifier("header-xp-details")
        }
        .padding(16)
        .fixedSize(horizontal: false, vertical: true)
    }
}
