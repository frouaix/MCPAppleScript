# MCP-AppleScript

A local MCP server that exposes controlled AppleScript automation tools to MCP clients on macOS.

## Overview

MCP-AppleScript provides a secure bridge between the Model Context Protocol and macOS automation via AppleScript. It consists of two components:

- **MCP Server (TypeScript/Node.js)**: Handles the MCP protocol, tool schemas, configuration, validation, logging, and policy enforcement
- **Swift Executor**: Executes AppleScript commands and returns structured JSON results

## Features

- 🔒 **Secure by default**: Policy-based allowlists for apps and tools
- 📝 **Template-based**: Pre-defined, parameterized scripts for safety
- 🛠️ **Multiple tools**: Notes, Calendar, Mail automation and more
- ⚙️ **Configurable**: Fine-grained control over permissions and behavior
- 📊 **Structured outputs**: All tools return JSON data + human-readable summaries
- 🧪 **Well-tested**: Comprehensive unit and integration tests

## Supported Apps (Planned)

- **Notes**: Create notes
- **Calendar**: Create events
- **Mail**: Compose drafts
- More coming soon...

## Requirements

- macOS 12.0 or later
- Node.js 20+
- Swift 5.9+ (for building the executor)
- pnpm 8+

## Installation

> ⚠️ **Status**: This project is currently under development.

```bash
# Clone the repository
git clone https://github.com/frouaix/MCPAppleScript.git
cd MCPAppleScript

# Install dependencies
pnpm install

# Build the project
pnpm build

# Run tests
pnpm test
```

## Configuration

Create a configuration file at `~/.config/applescript-mcp/config.json`:

```json
{
  "executorPath": "/usr/local/bin/applescript-executor",
  "defaultTimeoutMs": 12000,
  "apps": {
    "com.apple.Notes": {
      "enabled": true,
      "allowedTools": ["notes.create_note"]
    }
  },
  "logging": {
    "level": "info",
    "redact": ["email", "content"]
  }
}
```

## Automation Permissions

On first use, macOS will prompt for automation permissions. You need to:

1. Open **System Settings** → **Privacy & Security** → **Automation**
2. Find your terminal or the executor binary
3. Enable permissions for the apps you want to automate (Notes, Calendar, etc.)

## Architecture

The system uses a two-process architecture:

```
MCP Client
    ↓ (stdio)
TypeScript MCP Server
    ↓ (JSON over stdin/stdout)
Swift Executor
    ↓ (Apple Events)
macOS Apps (Notes, Calendar, etc.)
```

## Security

- Template-based execution prevents arbitrary script injection
- Per-app, per-tool permission model
- Input validation with Zod schemas
- Sensitive data redaction in logs
- Timeout enforcement on all operations

## Development

See [CONTRIBUTING.md](CONTRIBUTING.md) for development guidelines.

## License

MIT License - see [LICENSE](LICENSE) file for details.

## Author

François Rouaix

## Status

🚧 **Under Development** - Not yet ready for production use.
