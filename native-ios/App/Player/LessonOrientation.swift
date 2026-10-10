import Observation
import SwiftUI
import UIKit

/// The lesson owns this policy; the weak scene registry cannot keep a lesson alive.
@MainActor @Observable final class LessonOrientation {
    private(set) var isFullscreen = false
    var failed = false
    @ObservationIgnored private weak var scene: UIWindowScene?
    @ObservationIgnored private var revision = UUID()
    private static let owners = NSMapTable<UIWindowScene, LessonOrientation>.weakToWeakObjects()

    static func supported(in scene: UIWindowScene?) -> UIInterfaceOrientationMask {
        guard let scene, let owner = owners.object(forKey: scene), owner.isFullscreen else { return .portrait }
        return .landscapeRight
    }

    func connect(_ scene: UIWindowScene) {
        guard self.scene !== scene else { return }
        release()
        self.scene = scene
        Self.owners.setObject(self, forKey: scene)
    }

    func setFullscreen(_ fullscreen: Bool) {
        guard let scene, Self.owners.object(forKey: scene) === self else { failed = true; return }
        guard fullscreen != isFullscreen else { return }
        let previous = isFullscreen
        revision = UUID()
        let request = revision
        failed = false
        isFullscreen = fullscreen
        Self.invalidateControllers(in: scene)
        scene.requestGeometryUpdate(.iOS(interfaceOrientations: fullscreen ? .landscapeRight : .portrait)) { [weak self, weak scene] _ in
            guard let self, let scene, self.revision == request,
                  Self.owners.object(forKey: scene) === self else { return }
            self.isFullscreen = previous
            Self.invalidateControllers(in: scene)
            scene.requestGeometryUpdate(.iOS(interfaceOrientations: previous ? .landscapeRight : .portrait))
            self.failed = true
        }
    }

    func release() {
        revision = UUID()
        isFullscreen = false
        guard let scene, Self.owners.object(forKey: scene) === self else { self.scene = nil; return }
        Self.owners.removeObject(forKey: scene)
        self.scene = nil
        Self.invalidateControllers(in: scene)
        scene.requestGeometryUpdate(.iOS(interfaceOrientations: .portrait))
    }

    private static func invalidateControllers(in scene: UIWindowScene) {
        for window in scene.windows {
            var controller = window.rootViewController
            while let current = controller {
                current.setNeedsUpdateOfSupportedInterfaceOrientations()
                controller = current.presentedViewController
            }
        }
    }
}

/// Public scene orientation policy for iOS 27, with the iOS 26 app-delegate fallback.
final class LearningOrientationAppDelegate: NSObject, UIApplicationDelegate {
    func application(_ application: UIApplication, configurationForConnecting session: UISceneSession,
                     options: UIScene.ConnectionOptions) -> UISceneConfiguration {
        let configuration = UISceneConfiguration(name: nil, sessionRole: session.role)
        if session.role == .windowApplication { configuration.delegateClass = LearningOrientationSceneDelegate.self }
        return configuration
    }

    func application(_ application: UIApplication, supportedInterfaceOrientationsFor window: UIWindow?) -> UIInterfaceOrientationMask {
        LessonOrientation.supported(in: window?.windowScene)
    }
}

final class LearningOrientationSceneDelegate: NSObject, UIWindowSceneDelegate {
    @available(iOS 27.0, *)
    func supportedInterfaceOrientations(for windowScene: UIWindowScene) -> UIInterfaceOrientationMask {
        LessonOrientation.supported(in: windowScene)
    }
}

/// Resolves only this view's scene, never a process-global first/key window.
struct LessonOrientationHost: UIViewRepresentable {
    let orientation: LessonOrientation
    func makeUIView(context: Context) -> SceneView {
        let view = SceneView()
        view.orientation = orientation
        return view
    }
    func updateUIView(_ view: SceneView, context: Context) {
        if let scene = view.window?.windowScene { orientation.connect(scene) }
    }
    static func dismantleUIView(_ view: SceneView, coordinator: ()) { view.orientation?.release() }

    final class SceneView: UIView {
        weak var orientation: LessonOrientation?
        override func didMoveToWindow() {
            super.didMoveToWindow()
            if let scene = window?.windowScene { orientation?.connect(scene) }
        }
    }
}
