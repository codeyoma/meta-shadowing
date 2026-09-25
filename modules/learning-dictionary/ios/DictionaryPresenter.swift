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
    sheet.close = { [weak self] in self?.dismiss(id: id) }
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
  var close: (() -> Void)?
  private let library: UIReferenceLibraryViewController

  init(term: String) {
    library = UIReferenceLibraryViewController(term: term)
    super.init(nibName: nil, bundle: nil)
    modalPresentationStyle = .pageSheet
    sheetPresentationController?.detents = [.large()]
    presentationController?.delegate = self
  }
  required init?(coder: NSCoder) { fatalError("init(coder:) is unavailable") }

  override func viewDidLoad() {
    super.viewDidLoad()
    view.backgroundColor = .systemBackground
    view.accessibilityViewIsModal = true
    let done = UIButton(type: .system)
    done.setTitle("닫기", for: .normal)
    done.titleLabel?.font = .preferredFont(forTextStyle: .body)
    done.titleLabel?.adjustsFontForContentSizeCategory = true
    done.accessibilityLabel = "사전 닫기"
    done.addAction(UIAction { [weak self] _ in self?.close?() }, for: .touchUpInside)
    let guidance = UILabel()
    guidance.text = "사전 설정: 설정 > 일반 > 사전"
    guidance.font = .preferredFont(forTextStyle: .footnote)
    guidance.adjustsFontForContentSizeCategory = true
    guidance.textColor = .secondaryLabel
    guidance.numberOfLines = 0
    let header = UIStackView(arrangedSubviews: [guidance, done])
    header.spacing = 12
    header.alignment = .center
    view.addSubview(header)
    addChild(library); view.addSubview(library.view); library.didMove(toParent: self)
    header.translatesAutoresizingMaskIntoConstraints = false
    library.view.translatesAutoresizingMaskIntoConstraints = false
    NSLayoutConstraint.activate([
      header.topAnchor.constraint(equalTo: view.safeAreaLayoutGuide.topAnchor, constant: 8),
      header.leadingAnchor.constraint(equalTo: view.leadingAnchor, constant: 20),
      header.trailingAnchor.constraint(equalTo: view.trailingAnchor, constant: -20),
      done.heightAnchor.constraint(greaterThanOrEqualToConstant: 44),
      done.widthAnchor.constraint(greaterThanOrEqualToConstant: 60),
      library.view.topAnchor.constraint(equalTo: header.bottomAnchor, constant: 8),
      library.view.leadingAnchor.constraint(equalTo: view.leadingAnchor),
      library.view.trailingAnchor.constraint(equalTo: view.trailingAnchor),
      library.view.bottomAnchor.constraint(equalTo: view.bottomAnchor),
    ])
  }
  override func viewDidDisappear(_ animated: Bool) {
    super.viewDidDisappear(animated)
    if presentingViewController == nil || isBeingDismissed { finished?() }
  }
  func presentationControllerDidDismiss(_ presentationController: UIPresentationController) { finished?() }
}
