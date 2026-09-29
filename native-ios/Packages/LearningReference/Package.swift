// swift-tools-version: 6.2
import PackageDescription

let package = Package(
    name: "LearningReference",
    platforms: [.iOS(.v26), .macOS(.v15)],
    products: [.library(name: "LearningReference", targets: ["LearningReference"])],
    dependencies: [.package(path: "../LearningDomain")],
    targets: [
        .target(name: "LearningReference", dependencies: ["LearningDomain"]),
        .testTarget(name: "LearningReferenceTests", dependencies: ["LearningReference", "LearningDomain"])
    ], swiftLanguageModes: [.v6]
)
