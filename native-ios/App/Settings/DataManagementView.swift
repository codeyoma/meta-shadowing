import AppFoundation
import SwiftUI

struct DataManagementView: View {
    let services: ProductServicesModel
    @State private var confirmation: ServiceConfirmation?
    var body: some View {
        Form {
            Section("현재 학습 프로필") {
                Text(services.syncState.profileID == "local" ? "이 기기의 게스트 기록" : "현재 iCloud 계정의 기기 기록")
                Button("이 기기의 학습 기록 삭제", role: .destructive) { confirmation = services.confirmation(.removeLocal) }
                    .accessibilityIdentifier("remove-local-history")
                Button("iCloud 학습 기록 삭제", role: .destructive) { confirmation = services.confirmation(.deleteCloud) }
                    .accessibilityIdentifier("delete-cloud-history")
                    .disabled(services.syncState.account.scope == nil)
            }.disabled(services.actionBusy || services.syncState.busy || services.syncState.resetPending)
            Section {
                Text("다운로드 삭제는 도서 카드의 메뉴에서 할 수 있어요. 학습 기록은 그대로 남습니다.")
                ServiceStatusView(services: services)
            }
        }.navigationTitle("데이터 관리")
            .alert("학습 기록을 삭제할까요?", item: $confirmation) { request in
                if request.action == .deleteCloud {
                    Button("iCloud 기록 삭제", role: .destructive) { Task { await services.perform(request) } }
                } else {
                    Button("이 기기 기록 삭제", role: .destructive) { Task { await services.perform(request) } }
                }
                Button("취소", role: .cancel) { }
            } message: { request in
                if request.action == .deleteCloud {
                    Text("현재 iCloud 계정의 학습 기록과 이 기기의 해당 프로필 기록을 삭제합니다. 다른 기기도 다음 동기화 때 반영됩니다. 자동 동기화는 꺼집니다.")
                } else {
                    Text("다운로드한 도서와 iCloud 기록은 삭제하지 않아요. 자동 동기화는 꺼집니다.")
                }
            }
    }
}
