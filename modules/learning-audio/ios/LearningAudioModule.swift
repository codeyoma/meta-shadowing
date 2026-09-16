import ExpoModulesCore

public class LearningAudioModule: Module {
  private let inspection = LocalAudioInspection(packages: URL.documentsDirectory.appendingPathComponent("lesson-packages"))

  public func definition() -> ModuleDefinition {
    Name("LearningAudio")
    AsyncFunction("durations") { (uris: [String]) async throws -> [Double] in
      try await self.inspection.durations(uris)
    }
    AsyncFunction("testStageAccess") { () async -> Bool in
      await TestBuildAccess.verifiedAccess()
    }
  }
}
