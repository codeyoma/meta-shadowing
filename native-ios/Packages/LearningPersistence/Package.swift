// swift-tools-version: 6.2
import PackageDescription

let package = Package(
    name: "LearningPersistence",
    platforms: [.iOS(.v26), .macOS(.v15)],
    products: [.library(name: "LearningPersistence", targets: ["LearningPersistence"])],
    dependencies: [.package(path: "../LearningDomain")],
    targets: [
        .target(name: "LearningPersistence", dependencies: ["LearningDomain"], linkerSettings: [.linkedLibrary("sqlite3")]),
        .testTarget(name: "LearningPersistenceTests", dependencies: ["LearningPersistence", "LearningDomain"])
    ],
    swiftLanguageModes: [.v6]
)
