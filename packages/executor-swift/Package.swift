// swift-tools-version: 5.9
import PackageDescription

let package = Package(
    name: "Executor",
    platforms: [
        .macOS(.v12)
    ],
    products: [
        .executable(
            name: "applescript-executor",
            targets: ["Executor"]
        )
    ],
    targets: [
        .executableTarget(
            name: "Executor",
            path: "Sources/Executor"
        )
    ]
)
