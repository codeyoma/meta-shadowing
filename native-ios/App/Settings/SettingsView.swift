import AppFoundation
import SwiftUI

struct SettingsView: View {
    let model: ProductModel
    var services: ProductServicesModel? = nil
    var changingProfile = false
    var body: some View {
        Form {
            Section {
                NavigationLink("학습 설정") { LearningPreferencesView(model: model) }
                    .disabled(changingProfile)
                if let services {
                    NavigationLink("iCloud 동기화") { CloudSyncView(services: services) }
                    NavigationLink("데이터 관리") { DataManagementView(services: services) }
                } else {
                    Text("서비스 설정을 확인해 주세요. 기본 도서는 계속 사용할 수 있어요.").font(.footnote)
                }
            }
            #if DEBUG
            Section { NavigationLink("개발 도구") { DeveloperToolsView() } }
            #endif
        }.navigationTitle("설정")
    }
}
