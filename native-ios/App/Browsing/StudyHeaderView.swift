import AppFoundation
import LearningDomain
import SwiftUI

enum StudyLanguage: String, CaseIterable, Identifiable {
    case english, japanese, chinese, german, spanish, french
    var id: String { rawValue }
    var title: String { switch self {
    case .english: "영어"; case .japanese: "일본어"; case .chinese: "중국어"
    case .german: "독일어"; case .spanish: "스페인어"; case .french: "프랑스어"
    } }
    var flag: String { switch self {
    case .english: "🇬🇧"; case .japanese: "🇯🇵"; case .chinese: "🇨🇳"
    case .german: "🇩🇪"; case .spanish: "🇪🇸"; case .french: "🇫🇷"
    } }
    var code: String { switch self {
    case .english: "EN"; case .japanese: "JP"; case .chinese: "CN"
    case .german: "DE"; case .spanish: "ES"; case .french: "FR"
    } }
}
struct StudyHeaderView: View {
    let language: StudyLanguage
    let progress: LanguageStudyProgress
    let select: (StudyLanguage) -> Void
    @State private var flagTap = 0
    var body: some View {
        HStack(alignment: .bottom, spacing: 16) {
            Menu {
                ForEach(StudyLanguage.allCases) { choice in
                    Button(choice.title) { select(choice) }
                }
            } label: {
                VStack(spacing: 4) {
                    Text(language.flag).font(.title2).frame(height: 30)
                    Text(language.code).font(.caption.bold())
                }.frame(minWidth: 44, minHeight: 44)
            }
            .accessibilityLabel("학습 언어, \(language.title)")
            .accessibilityIdentifier("language-menu")
            .simultaneousGesture(TapGesture().onEnded { flagTap += 1 })
            .sensoryFeedback(.impact(weight: .light), trigger: flagTap)
            VStack(spacing: 4) {
                ProgressView(value: Double(progress.level.current), total: Double(progress.level.required))
                    .tint(BrandStyle.yellow).frame(height: 30)
                HStack {
                    Text("Lv. \(progress.level.level)").bold()
                    Spacer()
                    Text(progress.level.maxLevel ? "MAX" : "\(progress.level.current) / \(progress.level.required) XP")
                        .foregroundStyle(.secondary).accessibilityIdentifier("header-xp")
                }.font(.caption).monospacedDigit()
            }
            VStack(spacing: 4) {
                Image(systemName: "flame.fill").foregroundStyle(progress.streak > 0 ? .orange : .secondary).frame(height: 30)
                Text("\(progress.streak)").font(.caption.bold()).monospacedDigit()
            }.frame(minWidth: 30).accessibilityElement(children: .ignore)
                .accessibilityLabel("연속 학습 \(progress.streak)일")
        }.padding(.horizontal, 20).padding(.vertical, 8).background(.background)
    }
}
