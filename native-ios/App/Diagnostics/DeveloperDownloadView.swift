#if DEBUG
import SwiftUI

/// A presentation-only playground. It never invokes delivery, storage, purchase, or learning APIs.
struct DeveloperDownloadView: View {
    private enum Phase { case idle, downloading, ready, failed }
    @State private var phase = Phase.idle
    @State private var progress = 0.0
    @State private var editing = false
    @State private var run: UUID?
    @Environment(\.scenePhase) private var scenePhase
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: 16) {
                    Text("개발용 미리보기예요. 실제 다운로드나 학습 기록은 바뀌지 않아요.").font(.footnote)
                    VStack(alignment: .leading, spacing: 12) {
                        Text("Morning Notes · Apple-hosted").font(.headline)
                        Text("총 12문장").font(.caption)
                        ProgressView(value: 0, total: 16).accessibilityLabel("완료한 스테이지 0/16")
                        if phase == .downloading {
                            HStack {
                                ProgressView(value: progress)
                                Text(progress, format: .percent.precision(.fractionLength(0))).monospacedDigit()
                                Button { reset() } label: {
                                    Image(systemName: "xmark.circle").frame(minWidth: 44, minHeight: 44)
                                }.accessibilityLabel("다운로드 취소")
                            }
                        } else if phase == .failed {
                            Text("저장 상태를 확인하지 못했어요.").font(.caption)
                            Button("저장 상태 다시 확인") { reset() }.frame(minHeight: 44)
                        } else if phase == .ready {
                            if editing {
                                Button("미리보기 다운로드 삭제", role: .destructive) { reset() }.frame(minHeight: 44)
                            } else {
                                Button { } label: { Image(systemName: "play.fill") }
                                    .buttonStyle(.primaryAction).accessibilityLabel("학습 미리보기")
                                    .accessibilityIdentifier("book-hosted-morning-notes-v1")
                            }
                        } else {
                            Button { progress = 0; phase = .downloading; run = UUID() } label: {
                                Image(systemName: "arrow.down.to.line").frame(maxWidth: .infinity, minHeight: 44)
                            }.accessibilityLabel("다운로드").accessibilityIdentifier("download-hosted-morning-notes-v1")
                        }
                    }.padding().background(.regularMaterial, in: .rect(cornerRadius: 16))
                    Button("처음 상태로") { reset() }.frame(minHeight: 44)
                    Button(editing ? "편집 완료" : "편집 상태 보기") { editing.toggle() }.frame(minHeight: 44)
                    Button("저장 확인 오류 보기") { run = nil; phase = .failed }.frame(minHeight: 44)
                        .disabled(phase == .downloading)
                }.padding()
            }.navigationTitle("다운로드 미리보기 · 10초")
        }
        .task(id: run) {
            guard let token = run else { return }
            for step in 1...40 {
                do { try await Task.sleep(for: .milliseconds(250)) } catch { return }
                guard run == token, !Task.isCancelled else { return }
                withAnimation(reduceMotion ? nil : .linear(duration: 0.25)) { progress = Double(step) / 40 }
            }
            phase = .ready; editing = false
        }
        .onChange(of: scenePhase) { _, value in if value != .active { reset() } }
        .onDisappear { reset() }
    }
    private func reset() { run = nil; phase = .idle; progress = 0; editing = false }
}
#endif
