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
| `applescript.get_mode` | Get current operation mode and enabled tools |
| `applescript.set_mode` | Change operation mode (readonly/create/full) |
| `notes.create_note` | Create a new note in Apple Notes |
| `calendar.create_event` | Create an event in Apple Calendar |
| `mail.compose_draft` | Compose an email draft in Apple Mail |
| `applescript.run_template` | Execute a registered template by ID (policy-gated) |
| `applescript.run_script` | Execute raw AppleScript (full mode only, requires confirmation) |

## Operation Modes

The server starts in **readonly** mode by default. Use `applescript.set_mode` to change modes on-the-fly:

| Mode | Description | Available Tools |
|------|-------------|-----------------|
| **readonly** | No creation, editing, or deleting | ping, list_apps, get_mode, set_mode |
| **create** | Readonly + creation allowed | + notes, calendar, mail, run_template |
| **full** | All operations, potentially destructive | + run_script (requires confirmation) |

When the mode changes, the client is notified via `notifications/tools/list_changed` and will only see tools available in the current mode.

### Destructive Action Confirmation

In **full** mode, destructive tools (like `run_script`) require user confirmation:
1. If the MCP client supports **elicitation**, a confirmation dialog is shown
2. Otherwise, a **confirmation token** is returned — pass it back in a second call to confirm

## Requirements

- macOS 12.0 or later
- Node.js 20+ (only for building from source)
- Swift 5.9+ (only for building from source)
- pnpm 8+ (only for building from source)

## Installation

### Option 1: Download pre-built binary (.dmg)

Download the latest `.dmg` from [GitHub Releases](https://github.com/frouaix/MCPAppleScript/releases):

1. Open the `.dmg` and copy `mcp-applescript` to `/usr/local/bin/`:
   ```bash
   sudo cp /Volumes/MCP-AppleScript\ */mcp-applescript /usr/local/bin/
   ```
2. Create a config file:
   ```bash
   mkdir -p ~/.config/applescript-mcp
   cat > ~/.config/applescript-mcp/config.json << 'EOF'
   {
     "defaultMode": "readonly",
     "apps": {
       "com.apple.Notes": { "enabled": true, "allowedTools": ["notes.create_note"] },
       "com.apple.iCal": { "enabled": true, "allowedTools": ["calendar.create_event"] },
       "com.apple.mail": { "enabled": true, "allowedTools": ["mail.compose_draft"] }
     }
   }
   EOF
   ```
3. Add to your MCP client config (see Claude Desktop below)

The pre-built binary is a self-contained executable with Node.js and the Swift executor embedded — no runtime dependencies required.

### Option 2: Build from source

```bash
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
      "command": "/usr/local/bin/mcp-applescript"
    }
  }
}
```

If building from source, use the dev path instead:
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
  "defaultMode": "readonly",
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

# Run unit tests (73 tests)
pnpm test:unit

# Run integration tests (4 tests, requires macOS)
pnpm test:integration

# Build Swift executor
cd packages/executor-swift && swift build

# Run the server in development mode
cd packages/mcp-server && pnpm dev
```

### Building the standalone binary

```bash
# Build self-contained binary (Node.js SEA + embedded Swift executor)
pnpm build:sea

# Package as .dmg
pnpm build:dmg
```

Output: `dist/mcp-applescript` (~107MB, ~40MB as .dmg)

## Security

- **Three operation modes** (readonly → create → full) with safe default
- **Destructive action confirmation** via MCP elicitation or confirmation tokens
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
        sea.ts           # SEA binary support (executor extraction)
        config/          # Configuration loading + Zod schemas
        mode/            # Operation mode manager + confirmation
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
  scripts/
    build-sea.sh         # Build self-contained binary (Node.js SEA)
    build-dmg.sh         # Package binary as .dmg
  docs/                  # Architecture documentation
  install.sh             # One-step installer (build from source)
```

## License

MIT — see [LICENSE](LICENSE)

## Author

François Rouaix
