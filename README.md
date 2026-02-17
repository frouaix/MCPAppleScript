# MCP-AppleScript

A local MCP server that exposes controlled AppleScript automation tools to MCP clients on macOS.

## Overview

MCP-AppleScript provides a secure bridge between the [Model Context Protocol](https://modelcontextprotocol.io/) and macOS automation via AppleScript. It consists of two components:

- **MCP Server (TypeScript/Node.js)**: Handles the MCP protocol, tool schemas, configuration, validation, logging, and policy enforcement
- **Swift Executor**: Executes AppleScript commands via `NSAppleScript` and returns structured JSON results

## Tools

| Tool | Description |
|------|-------------|
| `applescript.ping` | Health check — returns server version |
| `applescript.list_apps` | List configured apps and their policy status |
| `notes.create_note` | Create a new note in Apple Notes |
| `calendar.create_event` | Create an event in Apple Calendar |
| `mail.compose_draft` | Compose an email draft in Apple Mail |
| `applescript.run_template` | Execute a registered template by ID (policy-gated) |
| `applescript.run_script` | Execute raw AppleScript (disabled by default) |

## Requirements

- macOS 12.0 or later
- Node.js 20+
- Swift 5.9+ (for building the executor)
- pnpm 8+

## Quick Start

```bash
# Clone and install
git clone https://github.com/frouaix/MCPAppleScript.git
cd MCPAppleScript
./install.sh
```

The install script will:
1. Install Node.js dependencies
2. Build the TypeScript MCP server
3. Build and install the Swift executor to `/usr/local/bin/`
4. Create a default config at `~/.config/applescript-mcp/config.json`

### Claude Desktop Integration

Add to `~/Library/Application Support/Claude/claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "applescript": {
      "command": "node",
      "args": ["/path/to/MCPAppleScript/packages/mcp-server/dist/index.js"]
    }
  }
}
```

## Configuration

Configuration lives at `~/.config/applescript-mcp/config.json` (override via `APPLESCRIPT_MCP_CONFIG` env var):

```json
{
  "executorPath": "/usr/local/bin/applescript-executor",
  "defaultTimeoutMs": 12000,
  "apps": {
    "com.apple.Notes": {
      "enabled": true,
      "allowedTools": ["notes.create_note", "applescript.run_template"]
    },
    "com.apple.iCal": {
      "enabled": true,
      "allowedTools": ["calendar.create_event"]
    },
    "com.apple.mail": {
      "enabled": true,
      "allowedTools": ["mail.compose_draft"]
    }
  },
  "runScript": {
    "enabled": false,
    "allowedBundleIds": []
  },
  "logging": {
    "level": "info",
    "redact": ["email", "content", "body"]
  }
}
```

### Policy Model

- **Per-app allowlists**: Each app must be explicitly configured and enabled
- **Per-tool permissions**: Control which tools can target which apps
- **`run_script` disabled by default**: Raw AppleScript execution requires explicit opt-in
- **Timeouts enforced**: All operations are time-bounded

## Automation Permissions (TCC)

On first use, macOS will prompt for automation permissions:

1. Open **System Settings** → **Privacy & Security** → **Automation**
2. Find your terminal or the executor binary
3. Enable permissions for the apps you want to automate (Notes, Calendar, Mail)

If you see `AUTOMATION_DENIED` errors, check these permissions.

## Architecture

```
MCP Client (Claude, etc.)
    ↕ stdio (JSON-RPC)
TypeScript MCP Server
    ↕ JSON over stdin/stdout
Swift Executor (applescript-executor)
    ↕ Apple Events
macOS Apps (Notes, Calendar, Mail)
```

The Node process is the only MCP-facing component. Swift is a helper invoked locally for each tool call. See [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) for details.

## Development

```bash
# Install dependencies
pnpm install

# Build everything
pnpm build

# Run unit tests (53 tests)
pnpm test:unit

# Run integration tests (requires macOS)
pnpm test:integration

# Build Swift executor
cd packages/executor-swift && swift build

# Run the server in development mode
cd packages/mcp-server && pnpm dev
```

## Security

- **Template-based execution** prevents arbitrary script injection
- **Per-app, per-tool permission model** with explicit allowlists
- **Input validation** with Zod schemas on all tool parameters
- **Sensitive data redaction** in logs (configurable)
- **Timeout enforcement** on all executor operations
- **Stable error codes** for all failure modes

## Project Structure

```
MCPAppleScript/
  packages/
    mcp-server/          # TypeScript MCP server
      src/
        index.ts         # Stdio entrypoint
        server.ts        # MCP server + tool registration
        config/          # Configuration loading + Zod schemas
        policy/          # Allowlist/denylist enforcement
        exec/            # Executor spawning + IPC
        util/            # Errors, logging, JSON utils
    executor-swift/      # Swift executor CLI
      Sources/Executor/
        main.swift       # JSON dispatcher
        AppleScriptRunner.swift  # NSAppleScript execution
        AppTargeting.swift       # Bundle ID handling
        Errors.swift     # Error code mapping
        JsonIO.swift     # Stdin/stdout JSON I/O
  docs/                  # Architecture documentation
  install.sh             # One-step installer
```

## License

MIT — see [LICENSE](LICENSE)

## Author

François Rouaix
