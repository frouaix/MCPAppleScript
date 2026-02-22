import XCTest
@testable import Executor

final class ExecutorTests: XCTestCase {

    // MARK: - JsonEscape.handlers

    func testHandlersContainsJsonEsc() {
        XCTAssertTrue(JsonEscape.handlers.contains("on jsonEsc("))
        XCTAssertTrue(JsonEscape.handlers.contains("on replaceText("))
    }

    // MARK: - JsonEscape.wrapScript

    func testWrapScriptAppendsHandlers() {
        let script = "tell application \"Finder\"\nend tell"
        let wrapped = JsonEscape.wrapScript(script)
        XCTAssertTrue(wrapped.hasPrefix(script))
        XCTAssertTrue(wrapped.contains("on jsonEsc("))
    }

    // MARK: - JsonEscape.reserialize

    func testReserializeValidJsonObject() {
        let input: [String: Any] = ["value": "{\"name\":\"hello\",\"count\":42}"]
        let result = JsonEscape.reserialize(input)
        let value = result["value"] as? String ?? ""
        // Re-serialized JSON should still be valid and contain the same data
        let data = value.data(using: .utf8)!
        let parsed = try! JSONSerialization.jsonObject(with: data) as! [String: Any]
        XCTAssertEqual(parsed["name"] as? String, "hello")
        XCTAssertEqual(parsed["count"] as? Int, 42)
    }

    func testReserializeValidJsonArray() {
        let input: [String: Any] = ["value": "[{\"id\":\"1\"},{\"id\":\"2\"}]"]
        let result = JsonEscape.reserialize(input)
        let value = result["value"] as? String ?? ""
        let data = value.data(using: .utf8)!
        let parsed = try! JSONSerialization.jsonObject(with: data) as! [[String: Any]]
        XCTAssertEqual(parsed.count, 2)
    }

    func testReserializeNonJsonPassesThrough() {
        let input: [String: Any] = ["value": "just a plain string"]
        let result = JsonEscape.reserialize(input)
        XCTAssertEqual(result["value"] as? String, "just a plain string")
    }

    func testReserializeEmptyStringPassesThrough() {
        let input: [String: Any] = ["value": ""]
        let result = JsonEscape.reserialize(input)
        XCTAssertEqual(result["value"] as? String, "")
    }

    func testReserializeNoValueKeyPassesThrough() {
        let input: [String: Any] = ["error": "something"]
        let result = JsonEscape.reserialize(input)
        XCTAssertEqual(result["error"] as? String, "something")
    }

    func testReserializeMalformedJsonPassesThrough() {
        // Malformed JSON (unescaped quote in value) should pass through unchanged
        let input: [String: Any] = ["value": "{\"name\":\"bad\"quote\"}"]
        let result = JsonEscape.reserialize(input)
        XCTAssertEqual(result["value"] as? String, "{\"name\":\"bad\"quote\"}")
    }

    func testReserializePreservesSpecialChars() {
        // JSON with properly escaped special chars should round-trip
        let json = "{\"text\":\"line1\\nline2\\ttab\\\\back\\\"quote\"}"
        let input: [String: Any] = ["value": json]
        let result = JsonEscape.reserialize(input)
        let value = result["value"] as? String ?? ""
        let data = value.data(using: .utf8)!
        let parsed = try! JSONSerialization.jsonObject(with: data) as! [String: Any]
        XCTAssertEqual(parsed["text"] as? String, "line1\nline2\ttab\\back\"quote")
    }
}
