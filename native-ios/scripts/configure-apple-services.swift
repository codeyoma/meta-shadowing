import Foundation

enum ConfigurationFailure: Error { case invalid }
struct ServiceBuildConfiguration {
    var info: [String: Any] = [:]
    var entitlements: [String: Any] = [:]
    var delivery = false
}

func serviceConfiguration(info: [String: Any], entitlements: [String: Any], internalContent: Bool) throws -> ServiceBuildConfiguration {
    var result = ServiceBuildConfiguration()
    func identifier(_ value: Any?, prefix: String = "") throws -> String {
        guard let value = value as? String, value.count <= 255, value.hasPrefix(prefix),
              value.range(of: "^[A-Za-z0-9][A-Za-z0-9._-]+$", options: .regularExpression) != nil else { throw ConfigurationFailure.invalid }
        return value
    }
    var packs: Set<String> = []
    for prefix in ["Sample", "FreeDuo", "PaidDuo"] {
        guard info[prefix + "AssetPackID"] != nil else { continue }
        let pack = try identifier(info[prefix + "AssetPackID"])
        try require(pack != "delivery-diagnostic-v1" && packs.insert(pack).inserted)
        let group = try identifier(info["BAAppGroupID"], prefix: "group.")
        try require((entitlements["com.apple.security.application-groups"] as? [String])?.contains(group) == true)
        try require(info["BAHasManagedAssetPacks"] as? Bool == true && info["BAUsesAppleHosting"] as? Bool == true)
        if prefix == "FreeDuo" {
            try require(internalContent && info["FreeDuoEnabled"] as? Bool == true)
            result.info["FreeDuoEnabled"] = true
            result.info["NativeInternalContent"] = true
        }
        for suffix in prefix == "Sample" ? ["Descriptor"] : ["Descriptor", "Manifest"] {
            guard let json = info[prefix + suffix] as? String, json.utf8.count <= 20_000_000,
                  (try JSONSerialization.jsonObject(with: Data(json.utf8))) is [String: Any] else { throw ConfigurationFailure.invalid }
            result.info[prefix + suffix] = json
        }
        result.info[prefix + "AssetPackID"] = pack
        result.info["BAAppGroupID"] = group
        result.info["BAHasManagedAssetPacks"] = true; result.info["BAUsesAppleHosting"] = true
        result.entitlements["com.apple.security.application-groups"] = [group]
        result.delivery = true
    }
    if info["ProgressCloudConfigured"] as? Bool == true {
        let container = try identifier(info["ProgressCloudContainer"], prefix: "iCloud.")
        guard let environment = info["ProgressCloudEnvironment"] as? String,
              ["Development", "Production"].contains(environment) else { throw ConfigurationFailure.invalid }
        try require((entitlements["com.apple.developer.icloud-container-identifiers"] as? [String])?.contains(container) == true)
        try require((entitlements["com.apple.developer.icloud-services"] as? [String])?.contains("CloudKit") == true)
        try require(entitlements["com.apple.developer.icloud-container-environment"] as? String == environment)
        try require(entitlements["aps-environment"] as? String == environment.lowercased())
        result.info["ProgressCloudConfigured"] = true
        result.info["ProgressCloudContainer"] = container; result.info["ProgressCloudEnvironment"] = environment
        result.info["UIBackgroundModes"] = ["audio", "remote-notification"]
        result.entitlements["com.apple.developer.icloud-container-identifiers"] = [container]
        result.entitlements["com.apple.developer.icloud-services"] = ["CloudKit"]
        result.entitlements["com.apple.developer.icloud-container-environment"] = environment
        result.entitlements["aps-environment"] = environment.lowercased()
    }
    return result
}

func generate(info: [String: Any], entitlements: [String: Any], output: URL, internalContent: Bool, ci: Bool = false) throws {
    let configuration = try serviceConfiguration(info: info, entitlements: entitlements, internalContent: internalContent)
    let fs = FileManager.default
    let marker = output.appendingPathComponent(".native-service-config")
    if fs.fileExists(atPath: output.path) { try require(fs.fileExists(atPath: marker.path)) }
    else { try fs.createDirectory(at: output, withIntermediateDirectories: true) }
    try Data("1".utf8).write(to: marker, options: .atomic)
    func plist(_ name: String, _ value: [String: Any]) throws -> String {
        let file = output.appendingPathComponent(name)
        try PropertyListSerialization.data(fromPropertyList: value, format: .xml, options: 0).write(to: file, options: .atomic)
        return file.path
    }
    var debug = configuration.entitlements; debug["get-task-allow"] = true
    let debugPath = try plist("Debug.entitlements", debug)
    let releasePath = try plist("Release.entitlements", configuration.entitlements)
    let nativeRoot = URL(fileURLWithPath: #filePath).deletingLastPathComponent().deletingLastPathComponent()
    var app: [String: Any] = ["info": ["path": output.appendingPathComponent("Info.plist").path, "properties": configuration.info],
        "settings": ["configs": ["Debug": ["CODE_SIGN_ENTITLEMENTS": debugPath], "Release": ["CODE_SIGN_ENTITLEMENTS": releasePath]]]]
    var targets: [String: Any] = [:]
    if configuration.delivery {
        let extensionPath = try plist("Downloader.entitlements", ["com.apple.security.application-groups": configuration.entitlements["com.apple.security.application-groups"]!])
        app["dependencies"] = [["target": "SampleDownloader", "embed": true,
            "copy": ["destination": "productsDirectory", "subpath": "$(EXTENSIONS_FOLDER_PATH)"]]]
        targets["SampleDownloader"] = ["type": "extensionkit-extension", "platform": "iOS",
            "sources": [nativeRoot.appendingPathComponent("Extensions/ContentDownloader.swift").path],
            "settings": ["base": ["PRODUCT_BUNDLE_IDENTIFIER": "$(NATIVE_APP_BUNDLE_IDENTIFIER).SampleDownloader",
                "TARGETED_DEVICE_FAMILY": "1",
                "CODE_SIGN_ENTITLEMENTS": extensionPath, "APPLICATION_EXTENSION_API_ONLY": "YES", "SKIP_INSTALL": "YES"]],
            "info": ["path": output.appendingPathComponent("DownloaderInfo.plist").path,
                "properties": ["CFBundleDisplayName": "Content Downloader",
                    "EXAppExtensionAttributes": ["EXExtensionPointIdentifier": "com.apple.background-asset-downloader-extension"]]]]
    }
    targets["MetaShadowingNative"] = app
    var spec: [String: Any] = ["include": [nativeRoot.appendingPathComponent(ci ? "project-ci.yml" : "project.yml").path], "targets": targets]
    if configuration.delivery { spec["schemes"] = ["SampleDownloader": ["build": ["targets": ["SampleDownloader": "all"]]]] }
    try JSONSerialization.data(withJSONObject: spec, options: [.prettyPrinted, .sortedKeys])
        .write(to: output.appendingPathComponent("project.json"), options: .atomic)
    print("Generated native service configuration. Review the ignored files before signing; no service was contacted.")
}

func readPlist(_ path: String) throws -> [String: Any] {
    let file = URL(fileURLWithPath: path)
    let size = try file.resourceValues(forKeys: [.fileSizeKey, .isRegularFileKey])
    guard size.isRegularFile == true, let bytes = size.fileSize, bytes <= 50_000_000,
          let value = try PropertyListSerialization.propertyList(from: Data(contentsOf: file), format: nil) as? [String: Any]
    else { throw ConfigurationFailure.invalid }
    return value
}

func require(_ condition: @autoclosure () -> Bool) throws {
    guard condition() else { throw ConfigurationFailure.invalid }
}

func verifyEntitlements(info: [String: Any], actual: [String: Any], role: String) throws {
    if actual["beta-reports-active"] != nil {
        try require(actual["beta-reports-active"] as? Bool == true && actual["get-task-allow"] as? Bool == false)
    }
    let identities: Set<String> = ["application-identifier", "com.apple.developer.team-identifier", "get-task-allow", "com.apple.security.get-task-allow", "beta-reports-active"]
    let serviceValues = actual.filter { !identities.contains($0.key) }
    let expected: [String: Any]
    if role == "app" {
        expected = try serviceConfiguration(info: info, entitlements: actual, internalContent: info["NativeInternalContent"] as? Bool == true).entitlements
    } else if role == "extension" {
        guard let group = info["BAAppGroupID"] as? String, !group.isEmpty,
              info["BAHasManagedAssetPacks"] as? Bool == true, info["BAUsesAppleHosting"] as? Bool == true else { throw ConfigurationFailure.invalid }
        expected = ["com.apple.security.application-groups": [group]]
    } else { throw ConfigurationFailure.invalid }
    try require(NSDictionary(dictionary: serviceValues).isEqual(to: expected))
}

func selfTest(output: URL? = nil) throws {
    let empty = try serviceConfiguration(info: [:], entitlements: [:], internalContent: false)
    try require(empty.info.isEmpty && empty.entitlements.isEmpty && !empty.delivery)
    let group = "group.com.example.services", container = "iCloud.com.example.services"
    let info: [String: Any] = ["BAAppGroupID": group, "BAHasManagedAssetPacks": true, "BAUsesAppleHosting": true,
        "SampleAssetPackID": "fixture-sample", "SampleDescriptor": "{}", "LearningBookProductID": "com.example.book",
        "ProgressCloudConfigured": true, "ProgressCloudContainer": container, "ProgressCloudEnvironment": "Development",
        "UnrelatedPrivateValue": "must-not-copy"]
    let authority: [String: Any] = ["com.apple.security.application-groups": [group],
        "com.apple.developer.icloud-container-identifiers": [container], "com.apple.developer.icloud-services": ["CloudKit"],
        "com.apple.developer.icloud-container-environment": "Development", "aps-environment": "development"]
    let complete = try serviceConfiguration(info: info, entitlements: authority, internalContent: false)
    try require(complete.info["LearningBookProductID"] == nil)
    var legacy = info
    legacy["LearningBookProductID"] = nil
    legacy["PaidDuoAssetPackID"] = "fixture-duo"
    legacy["PaidDuoDescriptor"] = "{}"; legacy["PaidDuoManifest"] = "{}"
    let legacyResult = try serviceConfiguration(info: legacy, entitlements: authority, internalContent: false)
    try require(legacyResult.delivery && legacyResult.info["PaidDuoAssetPackID"] as? String == "fixture-duo")
    try verifyEntitlements(info: info, actual: authority, role: "app")
    try verifyEntitlements(info: [:], actual: ["get-task-allow": true], role: "app")
    // App Store re-signing adds Apple's beta identity flag, not a service capability.
    var betaInfo = info, betaAuthority = authority
    betaInfo["ProgressCloudEnvironment"] = "Production"
    betaAuthority["com.apple.developer.icloud-container-environment"] = "Production"
    betaAuthority["aps-environment"] = "production"
    betaAuthority["get-task-allow"] = false
    betaAuthority["beta-reports-active"] = true
    try verifyEntitlements(info: betaInfo, actual: betaAuthority, role: "app")
    try verifyEntitlements(info: info, actual: ["com.apple.security.application-groups": [group],
        "get-task-allow": false, "beta-reports-active": true], role: "extension")
    for invalidFlag: Any in [false, "true"] {
        var invalidBeta = betaAuthority
        invalidBeta["beta-reports-active"] = invalidFlag
        do {
            try verifyEntitlements(info: betaInfo, actual: invalidBeta, role: "app")
            throw NSError(domain: "ExpectedInvalidBetaFlagRejection", code: 1)
        } catch ConfigurationFailure.invalid { }
    }
    var debugBeta = betaAuthority
    debugBeta["get-task-allow"] = true
    do {
        try verifyEntitlements(info: betaInfo, actual: debugBeta, role: "app")
        throw NSError(domain: "ExpectedDebugBetaRejection", code: 1)
    } catch ConfigurationFailure.invalid { }
    var excessiveBeta = betaAuthority
    excessiveBeta["com.apple.developer.healthkit"] = true
    do {
        try verifyEntitlements(info: betaInfo, actual: excessiveBeta, role: "app")
        throw NSError(domain: "ExpectedBetaCapabilityRejection", code: 1)
    } catch ConfigurationFailure.invalid { }
    var excessive = authority; excessive["com.apple.developer.healthkit"] = true
    do {
        try verifyEntitlements(info: info, actual: excessive, role: "app")
        throw NSError(domain: "ExpectedEntitlementRejection", code: 1)
    } catch ConfigurationFailure.invalid { }
    try require(complete.delivery && complete.info["UnrelatedPrivateValue"] == nil)
    try require(complete.entitlements["com.apple.security.application-groups"] as? [String] == [group])
    try require(complete.entitlements["com.apple.developer.icloud-container-identifiers"] as? [String] == [container])
    do {
        _ = try serviceConfiguration(info: info, entitlements: [:], internalContent: false)
        throw NSError(domain: "ExpectedConfigurationRejection", code: 1)
    } catch ConfigurationFailure.invalid { }
    var free = info
    free["FreeDuoEnabled"] = true; free["FreeDuoAssetPackID"] = "duo-33-free-test-v2"
    free["FreeDuoDescriptor"] = "{}"; free["FreeDuoManifest"] = "{}"
    do {
        _ = try serviceConfiguration(info: free, entitlements: authority, internalContent: false)
        throw NSError(domain: "ExpectedInternalContentRejection", code: 1)
    } catch ConfigurationFailure.invalid { }
    print("PASS: absent, complete, mismatched and internal-only service configuration.")
    if let output { try generate(info: info, entitlements: authority, output: output, internalContent: false, ci: true) }
}

do {
    if CommandLine.arguments.dropFirst() == ["--self-test"] { try selfTest() }
    else if CommandLine.arguments.count == 3, CommandLine.arguments[1] == "--fixture-output" {
        try selfTest(output: URL(fileURLWithPath: CommandLine.arguments[2], isDirectory: true))
    } else if CommandLine.arguments.count == 4, CommandLine.arguments[1] == "--verify-entitlements" {
        let data = FileHandle.standardInput.readDataToEndOfFile()
        guard let actual = try PropertyListSerialization.propertyList(from: data, format: nil) as? [String: Any] else { throw ConfigurationFailure.invalid }
        try verifyEntitlements(info: readPlist(CommandLine.arguments[2]), actual: actual, role: CommandLine.arguments[3])
    } else {
        let arguments = Array(CommandLine.arguments.dropFirst())
        guard arguments.count == 6 || (arguments.count == 7 && arguments.last == "--allow-internal-content"),
              arguments[0] == "--source-info", arguments[2] == "--source-entitlements", arguments[4] == "--output" else {
            throw ConfigurationFailure.invalid
        }
        try generate(info: readPlist(arguments[1]), entitlements: readPlist(arguments[3]),
                     output: URL(fileURLWithPath: arguments[5], isDirectory: true), internalContent: arguments.count == 7)
    }
} catch {
    // Never print source dictionaries, resolved identifiers, paths or credentials.
    FileHandle.standardError.write(Data("Service configuration validation failed.\n".utf8))
    exit(1)
}
