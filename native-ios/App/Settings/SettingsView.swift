import AppFoundation
import SwiftUI

struct SettingsView: View {
    let model: ProductModel
    var body: some View {
        Form {
            Section {
                NavigationLink("학습 설정") { LearningPreferencesView(model: model) }
                NavigationLink("iCloud 동기화") { ServiceUnavailableView(title: "iCloud 동기화", ticket: "#98") }
                NavigationLink("데이터 관리") { ServiceUnavailableView(title: "데이터 관리", ticket: "#98") }
                NavigationLink("구매 복원") { ServiceUnavailableView(title: "구매 복원", ticket: "#98") }
            }
        }.navigationTitle("설정")
    }
}
