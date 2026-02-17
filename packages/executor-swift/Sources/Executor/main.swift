import Foundation

struct Executor {
    static func main() {
        var standardError = FileHandle.standardError
        print("AppleScript Executor v0.1.0", to: &standardError)
        
        // TODO: Read JSON request from stdin
        // TODO: Parse and validate request
        // TODO: Execute AppleScript
        // TODO: Return JSON response to stdout
        
        let response = """
        {
            "requestId": "test",
            "ok": true,
            "result": {
                "message": "Executor initialized"
            }
        }
        """
        
        print(response)
    }
}

extension FileHandle: TextOutputStream {
    public func write(_ string: String) {
        guard let data = string.data(using: .utf8) else { return }
        try? write(contentsOf: data)
    }
}

Executor.main()
