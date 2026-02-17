# MCP-AppleScript Project Context

## Project Overview

This is an MCP (Model Context Protocol) server that provides controlled AppleScript automation capabilities for macOS applications. The project uses a two-process architecture with a TypeScript MCP server and a Swift executor.

## Architecture

- **MCP Server (TypeScript)**: Handles MCP protocol, tool registration, validation, policy enforcement, mode management, and configuration
- **Swift Executor**: Executes AppleScript commands via NSAppleScript and returns structured JSON results
- **Communication**: The Node process spawns the Swift executor and communicates via JSON over stdin/stdout

## Operation Modes

The server has three operation modes, defaulting to **readonly**:

- **readonly**: Only read/query tools (ping, list_apps, get_mode, set_mode)
- **create**: Readonly + creation tools (notes, calendar, mail, run_template)
- **full**: All tools including destructive ones (run_script, requires confirmation)

Mode is changed via `applescript.set_mode` tool. Tools are dynamically enabled/disabled using `RegisteredTool.enable()/disable()` and `sendToolListChanged()`.

The tool-to-mode mapping is **configurable** in `config.modes`. Each mode lists the tools introduced at that level; modes are cumulative. The hardcoded defaults can be overridden to promote or restrict tools.

Destructive actions in full mode use MCP elicitation for user confirmation, with a confirmation-token fallback for clients that don't support elicitation.

## Key Design Principles

1. **Security First**: Template-based execution, strict policy enforcement, mode-gated access, confirmation for destructive actions
2. **Structured Outputs**: All tools return both JSON data and human-readable summaries
3. **Policy-Based**: Per-app, per-tool allowlists with fine-grained control + mode-based access control
4. **Type Safety**: Zod schemas with max-length constraints for all inputs and configuration
5. **Monorepo Structure**: Separate packages for TypeScript and Swift components
6. **DryRun Support**: All executor tools accept a `dryRun` flag to preview generated scripts

## Technology Stack

- **Package Manager**: pnpm with workspaces
- **TypeScript**: Strict mode with comprehensive type checking
- **Testing**: node:test for TypeScript (79 unit + 4 integration tests)
- **MCP SDK**: @modelcontextprotocol/sdk v1.26 (elicitation, tool annotations, dynamic tool list)
- **Validation**: Zod schemas
- **Swift**: NSAppleScript for AppleScript execution

## Project Structure

- `packages/mcp-server/`: TypeScript MCP server implementation
  - `src/server.ts`: MCP server setup + all tool registrations with annotations
  - `src/index.ts`: Stdio entrypoint
  - `src/mode/`: Operation mode manager (`mode.ts`) + confirmation system (`confirmation.ts`)
  - `src/exec/`: Executor spawning and IPC handling
  - `src/policy/`: Permission and policy enforcement (mode + per-app checks)
  - `src/config/`: Configuration loading and validation (Zod schemas)
  - `src/util/`: Errors, logging, JSON utilities
- `packages/executor-swift/`: Swift executor CLI
  - `Sources/Executor/main.swift`: JSON dispatcher with dryRun support
  - `Sources/Executor/AppleScriptRunner.swift`: NSAppleScript execution + templates
  - `Sources/Executor/AppTargeting.swift`: Bundle ID validation
  - `Sources/Executor/Errors.swift`: Error code mapping
  - `Sources/Executor/JsonIO.swift`: Stdin/stdout JSON I/O

## Registered Tools (9 total)

Tool-to-mode mapping is configurable via `config.modes`. Default classification:

| Tool | Default Mode | Annotations |
|------|------|-------------|
| `applescript.ping` | readonly | readOnlyHint: true |
| `applescript.list_apps` | readonly | readOnlyHint: true |
| `applescript.get_mode` | readonly | readOnlyHint: true |
| `applescript.set_mode` | readonly | destructiveHint: false |
| `notes.create_note` | create | destructiveHint: false |
| `calendar.create_event` | create | destructiveHint: false |
| `mail.compose_draft` | create | destructiveHint: false |
| `applescript.run_template` | create | destructiveHint: true |
| `applescript.run_script` | full | destructiveHint: true + confirmation |

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
- Document public APIs with doc comments

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
pnpm test:unit        # Unit tests (79 tests)
pnpm test:integration # Integration tests (4 tests, macOS only)
pnpm lint             # Lint
pnpm format           # Format
```

## Related Documentation

See the `docs/` directory for detailed architecture, implementation plans, and contracts.
