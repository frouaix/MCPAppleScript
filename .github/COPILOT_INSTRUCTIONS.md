# MCP-AppleScript Project Context

## Project Overview

This is an MCP (Model Context Protocol) server that provides controlled AppleScript automation capabilities for 10 macOS Apple applications. The project uses a two-process architecture with a TypeScript MCP server and a Swift executor, connected via a generic ResourceAdapter pattern.

## Architecture

- **MCP Server (TypeScript)**: Handles MCP protocol, generic app.* tools, AppRegistry with per-app adapters, policy enforcement, mode management, and configuration
- **Swift Executor**: Executes AppleScript commands via NSAppleScript, with per-app template modules
- **Communication**: The Node process spawns the Swift executor and communicates via JSON over stdin/stdout
- **ResourceAdapter Pattern**: Each app implements a common adapter interface mapping generic CRUD operations to app-specific AppleScript templates

## Supported Apps (10)

| App | Bundle ID | Container | Item | Special Capabilities |
|-----|-----------|-----------|------|---------------------|
| Notes | com.apple.Notes | folder | note | Full CRUD |
| Calendar | com.apple.iCal | calendar | event | Full CRUD |
| Reminders | com.apple.reminders | list | reminder | Full CRUD + complete action |
| Mail | com.apple.mail | mailbox | message | CRUD + send action |
| Contacts | com.apple.Contacts | group | person | Full CRUD |
| Messages | com.apple.MobileSMS | chat | message | Read + send (no update/delete) |
| Photos | com.apple.Photos | album | media | Read + create album + import |
| Music | com.apple.Music | playlist | track | Read + create playlist + playback |
| Finder | com.apple.finder | folder | file | Full CRUD + move/duplicate/reveal |
| Safari | com.apple.Safari | window | tab | Read + open/close + JS execution |

## Operation Modes

The server has three operation modes, defaulting to **readonly**:

- **readonly**: Read/query tools (ping, get_mode, set_mode, app.list, app.get, app.search, app.list_containers)
- **create**: Readonly + creation tools (app.create, app.action, run_template)
- **full**: All tools including destructive ones (app.update, app.delete, run_script — requires confirmation)

Mode is changed via `applescript.set_mode` tool. Tools are dynamically enabled/disabled using `RegisteredTool.enable()/disable()` and `sendToolListChanged()`.

The tool-to-mode mapping is **configurable** in `config.modes`. Each mode lists the tools introduced at that level; modes are cumulative. The hardcoded defaults can be overridden to promote or restrict tools.

Destructive actions in full mode use MCP elicitation for user confirmation, with a confirmation-token fallback for clients that don't support elicitation.

## Key Design Principles

1. **Security First**: Template-based execution, strict policy enforcement, mode-gated access, confirmation for destructive actions
2. **Generic Tools**: One set of app.* tools works across all 10 apps via adapters
3. **Policy-Based**: Per-app, per-tool allowlists with fine-grained control + mode-based access control
4. **Type Safety**: Zod schemas with max-length constraints for all inputs and configuration
5. **Monorepo Structure**: Separate packages for TypeScript and Swift components
6. **DryRun Support**: All executor tools accept a `dryRun` flag to preview generated scripts

## Technology Stack

- **Package Manager**: pnpm with workspaces
- **TypeScript**: Strict mode with comprehensive type checking
- **Testing**: node:test for TypeScript (150 unit + 4 integration tests)
- **MCP SDK**: @modelcontextprotocol/sdk v1.26 (elicitation, tool annotations, dynamic tool list)
- **Validation**: Zod schemas
- **Swift**: NSAppleScript for AppleScript execution

## Project Structure

- `packages/mcp-server/`: TypeScript MCP server implementation
  - `src/server.ts`: MCP server setup + all tool registrations with annotations
  - `src/index.ts`: Stdio entrypoint
  - `src/adapters/`: ResourceAdapter interfaces + per-app adapters (notes, calendar, reminders, mail, contacts, messages, photos, music, finder, safari)
  - `src/mode/`: Operation mode manager (`mode.ts`) + confirmation system (`confirmation.ts`)
  - `src/exec/`: Executor spawning and IPC handling
  - `src/policy/`: Permission and policy enforcement (mode + per-app checks)
  - `src/config/`: Configuration loading and validation (Zod schemas)
  - `src/util/`: Errors, logging, JSON utilities
- `packages/executor-swift/`: Swift executor CLI
  - `Sources/Executor/main.swift`: JSON dispatcher with dryRun support
  - `Sources/Executor/AppleScriptRunner.swift`: Template dispatch to per-app modules
  - `Sources/Executor/{App}Templates.swift`: Per-app AppleScript template builders (10 files)
  - `Sources/Executor/AppTargeting.swift`: Bundle ID validation
  - `Sources/Executor/Errors.swift`: Error code mapping
  - `Sources/Executor/JsonIO.swift`: Stdin/stdout JSON I/O

## Registered Tools (13 total)

Tool-to-mode mapping is configurable via `config.modes`. Default classification:

| Tool | Default Mode | Description |
|------|------|-------------|
| `applescript.ping` | readonly | Health check |
| `applescript.get_mode` | readonly | Get current mode |
| `applescript.set_mode` | readonly | Change mode |
| `app.list_containers` | readonly | List containers (folders, calendars, etc.) |
| `app.list` | readonly | List items in a container |
| `app.get` | readonly | Get item by ID |
| `app.search` | readonly | Search/filter items |
| `app.create` | create | Create new item |
| `app.action` | create | App-specific actions (send, play, etc.) |
| `applescript.run_template` | create | Run named template |
| `app.update` | full | Update item (confirmation required) |
| `app.delete` | full | Delete item (confirmation required) |
| `applescript.run_script` | full | Raw AppleScript (confirmation required) |

## Development Guidelines

### TypeScript Conventions
- Use strict TypeScript settings
- Prefer explicit types over inference for public APIs
- Use Zod for runtime validation with max-length constraints
- Keep functions small and focused
- Export types alongside implementations
- Use meaningful error messages with error codes

### Swift Conventions
- Follow Swift API Design Guidelines
- Use explicit error handling with typed errors
- Prefer value types (structs) where appropriate
- One template file per app, dispatched via prefix routing in AppleScriptRunner

### Testing Strategy
- Unit tests: Mock external dependencies, test logic in isolation
- Integration tests: Real MCP protocol over stdio (macOS only)
- Test both success and error paths
- Include edge cases and validation failures

### Security Considerations
- Never log sensitive data (use redaction)
- Validate all inputs with Zod schemas (max-length enforced)
- Escape/sanitize parameters in AppleScript templates
- Enforce timeouts on all operations
- Use stable error codes for error handling
- Mode-based access control (readonly by default)
- Confirmation required for destructive operations

## Common Commands

```bash
pnpm install          # Install dependencies
pnpm build            # Build all packages
pnpm test:unit        # Unit tests (150 tests)
pnpm test:integration # Integration tests (4 tests, macOS only)
pnpm lint             # Lint
pnpm format           # Format
```

## Related Documentation

See the `docs/` directory for detailed architecture, implementation plans, and contracts.
