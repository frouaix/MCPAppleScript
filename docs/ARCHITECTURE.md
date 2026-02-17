# Goal

Build a local MCP server (stdio) that exposes a controlled set of “AppleScript automation tools” to MCP clients, implemented as:
- Node/TypeScript MCP server: protocol, tool schemas, config, validation, logging, policy enforcement.
- Swift “executor”: executes AppleScript / Apple Events reliably, returns structured JSON results.

The Node process is the only MCP-facing component. Swift is a helper invoked locally.

## High-level architecture

### Processes

1. MCP Server (Node/TS)
- Speaks MCP over stdin/stdout.
- Registers tools (tools/list, tools/call) with JSON Schemas.
- Loads config (allowlists, per-app policies).
- Validates tool inputs.
- Translates tool calls → a structured “automation request”.
- Calls the Swift executor.
- Returns structured results and errors.
2.	Executor (Swift)
- CLI binary (or later XPC).
- Accepts JSON request over stdin or as a file path argument.
- Executes AppleScript using NSAppleScript or Apple Events / ScriptingBridge.
- Returns JSON response to stdout (never prints extra noise).

### Data flow

MCP tool call → Node validates & enforces policy → Node spawns executor → executor runs AppleScript → executor returns JSON → Node maps to MCP result.