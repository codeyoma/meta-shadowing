import UIKit

@MainActor
final class DictionaryPresenter {
  enum Failure: Error { case unavailable }
  private var id: String?
  private var sheet: DictionarySheet?
  private var completion: ((Result<Void, Error>) -> Void)?
  private var cancelling = false
  private var closed = false

  func present(id: String, term: String, from root: UIViewController?, completion: @escaping (Result<Void, Error>) -> Void) {
    guard !closed, self.id == nil, UIApplication.shared.applicationState == .active,
      let root, root.viewIfLoaded?.window != nil, root.presentedViewController == nil,
      !root.isBeingDismissed, !root.isBeingPresented,
      DictionaryWords.ranges(term) == [NSRange(location: 0, length: (term as NSString).length)]
    else { completion(.failure(Failure.unavailable)); return }
    let sheet = DictionarySheet(term: term)
    self.id = id; self.sheet = sheet; self.completion = completion; cancelling = false
    sheet.finished = { [weak self] in self?.finish(id: id) }
    sheet.continueLearning = { [weak self] in self?.dismiss(id: id) }
    root.present(sheet, animated: true) { [weak self] in
      guard let self, self.id == id else { return }
      if self.cancelling { self.dismiss(id: id) }
    }
  }

  func dismiss(id: String) {
    guard self.id == id, let sheet else { return }
    cancelling = true
    if sheet.isBeingPresented { return } // Presentation completion performs this cancellation.
    if sheet.isBeingDismissed { return }
    sheet.dismiss(animated: false) { [weak self] in self?.finish(id: id) }
  }

  func dismissCurrent() { if let id { dismiss(id: id) } }
  func shutdown() { closed = true; dismissCurrent() }

  private func finish(id: String) {
    guard self.id == id else { return }
    let done = completion
    self.id = nil; sheet = nil; completion = nil; cancelling = false
    done?(.success(()))
  }
}

/** Hosts Apple's interface without reading or copying its definition content. */
@MainActor
private final class DictionarySheet: UIViewController, UIAdaptivePresentationControllerDelegate {
  var finished: (() -> Void)?
  var continueLearning: (() -> Void)?
  private let library: UIReferenceLibraryViewController

  init(term: String) {
    library = UIReferenceLibraryViewController(term: term)
    super.init(nibName: nil, bundle: nil)
    // Match player-options' native formSheet, full-height detent and grabber.
    modalPresentationStyle = .formSheet
    sheetPresentationController?.detents = [.large()]
    sheetPresentationController?.prefersGrabberVisible = true
    presentationController?.delegate = self
  }
  required init?(coder: NSCoder) { fatalError("init(coder:) is unavailable") }

  override func viewDidLoad() {
    super.viewDidLoad()
    view.backgroundColor = .systemBackground
    view.accessibilityViewIsModal = true
    addChild(library); view.addSubview(library.view); library.didMove(toParent: self)
    library.view.translatesAutoresizingMaskIntoConstraints = false

    // Keep the learning action outside the system dictionary's scrolling content.
    // Match ActionButton's brand colors, dimensions and pressed lower edge.
    var configuration = UIButton.Configuration.filled()
    configuration.title = "학습 이어하기"
    configuration.image = UIImage(systemName: "play.fill")
    configuration.imagePadding = 10
    configuration.preferredSymbolConfigurationForImage = UIImage.SymbolConfiguration(pointSize: 22)
    configuration.baseBackgroundColor = UIColor(red: 1, green: 200.0 / 255, blue: 0, alpha: 1)
    configuration.baseForegroundColor = UIColor(red: 4.0 / 255, green: 44.0 / 255, blue: 96.0 / 255, alpha: 1)
    configuration.cornerStyle = .fixed
    configuration.background.cornerRadius = 16
    configuration.contentInsets = NSDirectionalEdgeInsets(top: 13, leading: 18, bottom: 13, trailing: 18)
    configuration.titleTextAttributesTransformer = UIConfigurationTextAttributesTransformer { attributes in
      var attributes = attributes
      attributes.font = UIFontMetrics(forTextStyle: .headline).scaledFont(for: .systemFont(ofSize: 17, weight: .bold))
      return attributes
    }
    let resume = UIButton(configuration: configuration, primaryAction: UIAction { [weak self] _ in
      self?.continueLearning?()
    })
    resume.accessibilityLabel = "학습 이어하기"
    resume.titleLabel?.numberOfLines = 0
    resume.titleLabel?.adjustsFontForContentSizeCategory = true
    resume.layer.shadowColor = UIColor(red: 1, green: 150.0 / 255, blue: 0, alpha: 1).cgColor
    resume.layer.shadowRadius = 0
    resume.layer.shadowOffset = CGSize(width: 0, height: 4)
    resume.configurationUpdateHandler = { button in
      button.transform = button.isHighlighted ? CGAffineTransform(translationX: 0, y: 4) : .identity
      button.layer.shadowOpacity = button.isHighlighted ? 0 : 1
    }
    resume.translatesAutoresizingMaskIntoConstraints = false
    view.addSubview(resume)
    NSLayoutConstraint.activate([
      library.view.topAnchor.constraint(equalTo: view.topAnchor),
      library.view.leadingAnchor.constraint(equalTo: view.leadingAnchor),
      library.view.trailingAnchor.constraint(equalTo: view.trailingAnchor),
      library.view.bottomAnchor.constraint(equalTo: resume.topAnchor, constant: -16),
      resume.leadingAnchor.constraint(equalTo: view.safeAreaLayoutGuide.leadingAnchor, constant: 16),
      resume.trailingAnchor.constraint(equalTo: view.safeAreaLayoutGuide.trailingAnchor, constant: -16),
      resume.bottomAnchor.constraint(equalTo: view.safeAreaLayoutGuide.bottomAnchor, constant: -16),
      resume.heightAnchor.constraint(greaterThanOrEqualToConstant: 54),
    ])
  }
  override func viewDidDisappear(_ animated: Bool) {
    super.viewDidDisappear(animated)
    if presentingViewController == nil || isBeingDismissed { finished?() }
  }
  func presentationControllerDidDismiss(_ presentationController: UIPresentationController) { finished?() }
}
