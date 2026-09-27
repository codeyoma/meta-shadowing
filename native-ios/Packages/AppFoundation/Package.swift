// swift-tools-version: 6.2
import PackageDescription

let package = Package(
    name: "AppFoundation",
    platforms: [.iOS(.v26), .macOS(.v15)],
    products: [.library(name: "AppFoundation", targets: ["AppFoundation"])],
    dependencies: [.package(path: "../LearningDomain")],
    targets: [
        .target(name: "AppFoundation", dependencies: ["LearningDomain"]),
        .testTarget(name: "AppFoundationTests", dependencies: ["AppFoundation", "LearningDomain"])
    ],
    swiftLanguageModes: [.v6]
)
