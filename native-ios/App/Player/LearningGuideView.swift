import LearningDomain
import SwiftUI
struct LearningGuideView: View {
    let stage: Int
    var body: some View {
        List {
            if let guide = try? LearningGuideContent(stage: stage) {
                Section {
                    Text("Lv \((stage + 1) / 2)")
                    Text(StageMethod.title(stage))
                }
                Section("학습 방법") {
                    Text(guide.practice).accessibilityIdentifier("guide-practice")
                    if let grouping = guide.grouping {
                        Text(grouping).accessibilityIdentifier("guide-grouping")
                    }
                }
                Section("확인과 경험치") {
                    Text(guide.confirmation).accessibilityIdentifier("guide-confirmation")
                    Text(guide.rewards).accessibilityIdentifier("guide-rewards")
                    Text("자동 재생이나 단어 공개, 화면 이동만으로는 XP가 쌓이지 않아요.")
                }
            } else {
                Text("학습 정보를 열 수 없어요.")
            }
        }.navigationTitle("학습 안내")
    }
}

struct LearningGuideContent {
    let practice: String
    let grouping: String?
    let confirmation: String
    let rewards: String

    init(stage: Int) throws {
        let policy = try StagePolicy.forStage(stage)
        if let order = policy.revealOrder {
            let reveal: String
            switch order {
            case .targetFirst: reveal = String(localized: "원문 → 한국어 순서로 단어가 하나씩 쌓여요.")
            case .translationFirst: reveal = String(localized: "한국어 → 원문 순서로 단어가 하나씩 쌓여요.")
            case .translationOnly: reveal = String(localized: "한국어 단어만 하나씩 나타나고, 원문은 나오지 않아요.")
            }
            practice = reveal + " " + String(localized: "음성 없이 직접 말하며 연습해요. 가운데 속도 버튼에서 S1–S4를 선택할 수 있어요.")
        } else if policy.firstWordHints {
            practice = String(localized: "원문 음성은 끝까지 재생되고, 각 문장의 첫 단어만 힌트로 보여요. 번역은 항상 보여요. 자막 보기를 누르면 현재 학습 구간의 원문 전체를 볼 수 있어요.")
        } else {
            practice = String(localized: "자막과 번역을 보며 원문 음성을 듣고 따라 말해요.")
                + (stage <= 4 ? " " + String(localized: "1–4 스테이지는 같은 방식으로 연습해요.") : "")
        }
        grouping = policy.isGrouped
            ? String(localized: "설정한 2–4개 원본 구간을 한 묶음으로 연속 재생해요. 마지막 남은 구간은 별도 묶음으로 연습해요. 학습 메뉴에서 크기를 바꾸면 확인한 학습은 유지되고 새 묶음에서 일시정지돼요.")
            : nil
        confirmation = policy.isSilent
            ? String(localized: "한 번 연습하고 단어가 모두 나타나면 직접 확인해 주세요. 프레이즈마다 한 번만 확인해요.")
            : String(localized: "음성이 모두 끝난 뒤 직접 확인해 주세요. 세 번 확인하면 다음으로 이동하거나 두 번 더 반복할 수 있어요.")
        if policy.isSilent {
            rewards = String(localized: "한 프레이즈를 직접 확인하면 3 XP를 받고 다음 프레이즈로 이동해요.")
        } else if policy.isGrouped {
            rewards = String(localized: "확인할 때마다 새로 확인한 원본 구간 수만큼 XP를 받아요. 마지막 짧은 묶음은 실제 구간 수로 계산돼요.")
        } else {
            rewards = String(localized: "한 번 직접 확인할 때마다 1 XP를 받아요.")
        }
    }
}
