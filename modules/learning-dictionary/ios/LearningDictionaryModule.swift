import ExpoModulesCore
import UIKit

public class LearningDictionaryModule: Module {
  @MainActor private var presenter: DictionaryPresenter?

  @MainActor private func service() -> DictionaryPresenter {
    if let presenter { return presenter }
    let value = DictionaryPresenter(); presenter = value; return value
  }

  public func definition() -> ModuleDefinition {
    Name("LearningDictionary")
    Function("words") { (text: String) -> [[String: Int]] in
      DictionaryWords.ranges(text).map { ["start": $0.location, "end": NSMaxRange($0)] }
    }
    AsyncFunction("present") { (id: String, term: String, promise: Promise) in
      MainActor.assumeIsolated {
        self.service().present(id: id, term: term, from: self.appContext?.utilities?.currentViewController()) { result in
          switch result {
          case .success: promise.resolve()
          case .failure: promise.reject("dictionary-unavailable", "The dictionary could not be opened.")
          }
        }
      }
    }.runOnQueue(.main)
    AsyncFunction("dismiss") { (id: String) in
      MainActor.assumeIsolated { self.presenter?.dismiss(id: id) }
    }.runOnQueue(.main)
    OnAppEntersBackground { DispatchQueue.main.async { self.presenter?.dismissCurrent() } }
    OnAppContextDestroys { DispatchQueue.main.async { self.service().shutdown() } }
    OnDestroy { DispatchQueue.main.async { self.service().shutdown() } }
  }
}
