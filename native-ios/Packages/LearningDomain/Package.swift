// swift-tools-version: 6.2
import PackageDescription

let package = Package(
    name: "LearningDomain",
    platforms: [.iOS(.v26), .macOS(.v15)],
    products: [.library(name: "LearningDomain", targets: ["LearningDomain"])],
    targets: [
        .target(name: "LearningDomain"),
        .testTarget(name: "LearningDomainTests", dependencies: ["LearningDomain"])
    ],
    swiftLanguageModes: [.v6]
)
