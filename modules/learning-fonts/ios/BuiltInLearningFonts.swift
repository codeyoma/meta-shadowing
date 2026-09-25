import CoreText
import UIKit

enum BuiltInLearningFonts {
  static func available() -> [String] {
    var choices = ["system"]
    let system = UIFont.systemFont(ofSize: 20).fontDescriptor
    if system.withDesign(.rounded) != nil { choices.append("rounded") }
    if system.withDesign(.serif) != nil { choices.append("serif") }
    for (id, name) in [
      ("avenir-next", "AvenirNext-Regular"),
      ("georgia", "Georgia"),
      ("apple-sd-gothic-neo", "AppleSDGothicNeo-Regular")
    ] {
      if isBuiltInFace(name) { choices.append(id) }
    }
    return choices
  }

  // Query only approved regular faces. The protected system location excludes
  // user/app fonts. iOS can report process priority even for its built-in fonts.
  // Downloadable descriptors are rejected even if a font asset is already cached.
  // No matching-with-download callback or font registration API is used.
  static func isBuiltInFace(_ name: String) -> Bool {
    guard let font = UIFont(name: name, size: 20), font.fontName == name else { return false }
    guard let file = CTFontCopyAttribute(font as CTFont, kCTFontURLAttribute) as? URL,
          file.isFileURL,
          CTFontCopyAttribute(font as CTFont, kCTFontDownloadableAttribute) as? Bool != true
    else { return false }
    #if targetEnvironment(simulator)
    guard let root = ProcessInfo.processInfo.environment["SIMULATOR_ROOT"] else { return false }
    #else
    let root = ""
    #endif
    let directory = URL(fileURLWithPath: root + "/System/Library/Fonts", isDirectory: true)
      .resolvingSymlinksInPath().standardizedFileURL.path + "/"
    return file.resolvingSymlinksInPath().standardizedFileURL.path.hasPrefix(directory)
  }
}
