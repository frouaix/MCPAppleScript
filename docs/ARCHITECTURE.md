# Goal

Build a local MCP server that exposes a controlled set of AppleScript automation tools to MCP clients, implemented as a single Node/TypeScript process that uses macOS `osascript` to execute AppleScript.

## High-level architecture

### Process

MCP Server (Node/TS)
- Speaks MCP over stdio (default) or Streamable HTTP (`--http` flag).
- Registers tools (tools/list, tools/call) with JSON Schemas.
- Loads config (allowlists, per-app policies).
- Validates tool inputs.
- Translates tool calls to template ID + parameters, then builds AppleScript source.
- Executes via `osascript` (child_process.execFile, no shell).
- Returns structured results and errors.

### Data flow

MCP tool call -> Node validates & enforces policy -> TypeScript template builds AppleScript -> osascript executes -> JSON result returned -> Node maps to MCP result.
