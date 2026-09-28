import AppFoundation
import SwiftUI

struct ProductTabsView: View {
    let model: ProductModel
    @State private var tab = 0
    @State private var selectedStage: Int?
    var body: some View {
        if let snapshot = model.snapshot {
            VStack(spacing: 0) {
                StudyHeaderView(language: StudyLanguage(rawValue: snapshot.preferences.libraryLanguage ?? "") ?? .english,
                                progress: snapshot.progress) { language in
                    Task { await model.select(language: language.rawValue, packageKey: nil) }
                }.disabled(model.busy)
                if model.failed {
                    HStack {
                        Text("변경을 저장하지 못했어요.").font(.caption)
                        Button("다시 시도") { Task { await model.retry() } }
                    }.padding(8)
                }
                TabView(selection: $tab) {
                    Tab("도서 목록", systemImage: "books.vertical", value: 0) {
                        NavigationStack {
                            LibraryView(snapshot: snapshot) { book in
                                Task {
                                    await model.select(language: book.book.language, packageKey: book.id)
                                    if !model.failed { tab = 1 }
                                }
                            }.disabled(model.busy)
                        }
                    }
                    Tab("스테이지", systemImage: "map", value: 1) {
                        NavigationStack {
                            if let book = snapshot.selectedBook {
                                StagePathView(summary: book) { selectedStage = $0 }
                            } else { ContentUnavailableView("도서를 선택해 주세요", systemImage: "book") }
                        }
                    }
                    Tab("설정", systemImage: "gearshape", value: 2) {
                        NavigationStack { SettingsView(model: model) }
                    }
                }.sensoryFeedback(.impact(weight: .light), trigger: tab)
            }.tint(.primary)
        }
    }
}
