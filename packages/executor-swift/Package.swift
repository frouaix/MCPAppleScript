// swift-tools-version: 6.0
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
        ),
        .testTarget(
            name: "ExecutorTests",
            dependencies: ["Executor"],
            path: "Tests/ExecutorTests"
        )
    ]
)
