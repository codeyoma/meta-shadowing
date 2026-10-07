import AppFoundation
import SwiftUI

struct DataManagementView: View {
    let services: ProductServicesModel
    @State private var confirmation: ServiceConfirmation?
    var body: some View {
        Form {
            Section {
                Button("이 기기의 학습 기록 삭제", role: .destructive) { confirmation = services.confirmation(.removeLocal) }
                    .accessibilityIdentifier("remove-local-history")
                Button("iCloud 학습 기록 삭제", role: .destructive) { confirmation = services.confirmation(.deleteCloud) }
                    .accessibilityIdentifier("delete-cloud-history")
                    .disabled(services.syncState.account.scope == nil)
            }.disabled(services.actionBusy || services.syncState.busy || services.syncState.resetPending)
            ServiceStatusView(services: services)
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
                    Text("현재 프로필의 학습 기록만 삭제합니다. 다운로드한 도서와 iCloud 기록은 남고, 자동 동기화는 꺼집니다.")
                }
            }
    }
}
