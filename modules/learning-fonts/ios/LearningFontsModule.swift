import ExpoModulesCore

public class LearningFontsModule: Module {
  public func definition() -> ModuleDefinition {
    Name("LearningFonts")

    Function("availableFonts") { BuiltInLearningFonts.available() }
  }
}
