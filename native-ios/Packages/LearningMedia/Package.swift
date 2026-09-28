// swift-tools-version: 6.2
import PackageDescription

let package = Package(
    name: "LearningMedia",
    platforms: [.iOS(.v26), .macOS(.v15)],
    products: [.library(name: "LearningMedia", targets: ["LearningMedia"])],
    dependencies: [.package(path: "../LearningDomain"), .package(path: "../AppFoundation"), .package(path: "../LearningPersistence")],
    targets: [
        .target(name: "LearningMedia", dependencies: ["LearningDomain", "AppFoundation"]),
        .testTarget(name: "LearningMediaTests", dependencies: ["LearningMedia", "AppFoundation", "LearningDomain", "LearningPersistence"])
    ],
    swiftLanguageModes: [.v6]
)
