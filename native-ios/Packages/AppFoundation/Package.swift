// swift-tools-version: 6.2
import PackageDescription

let package = Package(
    name: "AppFoundation",
    platforms: [.iOS(.v26), .macOS(.v15)],
    products: [.library(name: "AppFoundation", targets: ["AppFoundation"])],
    dependencies: [.package(path: "../LearningDomain"), .package(path: "../LearningPersistence"), .package(path: "../LearningReference"), .package(path: "../AppleServices")],
    targets: [
        .target(name: "AppFoundation", dependencies: ["LearningDomain", "LearningPersistence", "LearningReference", "AppleServices"]),
        .testTarget(name: "AppFoundationTests", dependencies: ["AppFoundation", "LearningDomain", "LearningPersistence", "LearningReference"])
    ],
    swiftLanguageModes: [.v6]
)
