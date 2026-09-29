// swift-tools-version: 6.2
import PackageDescription

let package = Package(
    name: "AppleServices",
    platforms: [.iOS(.v26), .macOS(.v15)],
    products: [.library(name: "AppleServices", targets: ["AppleServices"])],
    dependencies: [.package(path: "../LearningDomain"), .package(path: "../LearningPersistence")],
    targets: [
        .target(name: "AppleServices", dependencies: ["LearningDomain"]),
        .testTarget(name: "AppleServicesTests", dependencies: ["AppleServices", "LearningPersistence"])
    ],
    swiftLanguageModes: [.v6]
)
