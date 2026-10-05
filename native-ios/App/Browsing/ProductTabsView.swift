import AppFoundation
import SwiftUI

struct ProductTabsView: View {
    let model: ProductModel
    var profiles: ProductProfileOwner? = nil
    var services: ProductServicesModel? = nil
    @State private var tab = 0
    @State private var learningRoute: LearningRoute?
    var body: some View {
        if let snapshot = model.snapshot {
            VStack(spacing: 0) {
                StudyHeaderView(language: StudyLanguage(rawValue: snapshot.preferences.libraryLanguage ?? "") ?? .english,
                                progress: snapshot.progress) { language in
                    Task { await model.select(language: language.rawValue, packageKey: nil) }
                }.disabled(model.busy || profiles?.changing == true)
                if model.failed {
                    HStack {
                        Text("변경을 저장하지 못했어요.").font(.caption)
                        Button("다시 시도") { Task { await model.retry() } }
                    }.padding(8)
                }
                if let services, services.error != nil {
                    HStack {
                        Text("서비스 작업을 완료하지 못했어요.").font(.caption)
                        Button("다시 시도") { Task { await services.retrySync() } }
                            .disabled(services.actionBusy || services.syncState.busy)
                    }.padding(8)
                }
                TabView(selection: $tab) {
                    Tab("도서 목록", systemImage: "books.vertical", value: 0) {
                        NavigationStack {
                            LibraryView(snapshot: snapshot, services: services) { book in
                                Task {
                                    await model.select(language: book.book.language, packageKey: book.id)
                                    if !model.failed { tab = 1 }
                                }
                            }.disabled(model.busy || profiles?.changing == true)
                        }
                    }
                    Tab("스테이지", systemImage: "map", value: 1) {
                        NavigationStack {
                            if profiles?.changing == true {
                                ContentUnavailableView("기록 처리를 완료해 주세요", systemImage: "arrow.triangle.2.circlepath",
                                    description: Text("설정의 데이터 관리에서 상태를 확인하고 다시 시도할 수 있어요."))
                            } else if let book = snapshot.selectedBook {
                                StagePathView(summary: book) { learningRoute = LearningRoute(packageKey: book.id, stage: $0) }
                            } else { ContentUnavailableView("도서를 선택해 주세요", systemImage: "book") }
                        }
                    }
                    Tab("설정", systemImage: "gearshape", value: 2) {
                        NavigationStack { SettingsView(model: model, services: services, changingProfile: profiles?.changing == true) }
                    }
                }.sensoryFeedback(.impact(weight: .light), trigger: tab)
            }.tint(.primary)
                .background { if let services { ServiceRetryConfirmationView(services: services) } }
                .accessibilityHidden(learningRoute != nil)
                .fullScreenCover(item: $learningRoute) { route in LearningPlayerView(route: route, model: model, profiles: profiles) }
        }
    }
}

private struct ServiceRetryConfirmationView: View {
    @Bindable var services: ProductServicesModel
    var body: some View {
        Color.clear.alert("삭제 작업을 다시 시도할까요?", item: $services.retryConfirmation) { request in
            Button("다시 삭제", role: .destructive) { Task { await services.perform(request) } }
            Button("취소", role: .cancel) { }
        } message: { request in
            switch request.action {
            case .deleteCloud: Text("현재 iCloud 계정과 이 기기의 해당 프로필 학습 기록을 삭제합니다. 자동 동기화는 꺼집니다.")
            case .removeLocal: Text("현재 프로필의 기기 학습 기록만 삭제합니다. iCloud 기록과 다운로드한 도서는 남습니다. 자동 동기화는 꺼집니다.")
            default: Text("선택한 도서의 다운로드만 삭제합니다. 학습 기록은 남습니다.")
            }
        }
    }
}
