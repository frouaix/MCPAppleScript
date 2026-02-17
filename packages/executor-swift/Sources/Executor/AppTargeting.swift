import Foundation
import AppKit

/// Handles resolving and validating app targets by bundle identifier.
enum AppTargeting {
    /// Checks if an app with the given bundle ID is currently running.
    static func isAppRunning(bundleId: String) -> Bool {
        return NSWorkspace.shared.runningApplications.contains {
            $0.bundleIdentifier == bundleId
        }
    }

    /// Returns the localized name for a bundle ID, or nil if not found.
    static func appName(forBundleId bundleId: String) -> String? {
        guard let url = NSWorkspace.shared.urlForApplication(withBundleIdentifier: bundleId) else {
            return nil
        }
        return FileManager.default.displayName(atPath: url.path)
    }

    /// Validates that a bundle ID looks reasonable (basic format check).
    static func validateBundleId(_ bundleId: String) -> Bool {
        // Bundle IDs follow reverse-DNS convention: com.apple.Notes
        let pattern = #"^[a-zA-Z][a-zA-Z0-9\-]*(\.[a-zA-Z][a-zA-Z0-9\-]*){1,}$"#
        return bundleId.range(of: pattern, options: .regularExpression) != nil
    }
}
