import LearningMedia
import SwiftUI

struct VoiceMonitorControls: View {
    let runtime: NativeLearningRuntime
    var body: some View {
        if runtime.monitorState != .blocked {
            HStack {
                Button {
                    Task { await runtime.monitoring.setEnabled(runtime.monitorState != .monitoring) }
                } label: {
                    Label(runtime.monitorState == .monitoring ? "내 목소리 켜짐" : "내 목소리 듣기",
                          systemImage: runtime.monitorState == .monitoring ? "mic.fill" : "mic.slash")
                        .frame(minHeight: 44)
                }.disabled(runtime.monitorState == .requesting || runtime.monitorState == .denied)
                if runtime.monitorState == .denied { Text("설정에서 마이크를 허용해 주세요.").font(.caption) }
                if runtime.monitorState == .failed { Text("연결을 확인하고 다시 시도해 주세요.").font(.caption) }
            }
        }
    }
}
