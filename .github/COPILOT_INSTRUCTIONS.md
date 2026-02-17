# MCP-AppleScript Project Context

## Project Overview

This is an MCP (Model Context Protocol) server that provides controlled AppleScript automation capabilities for macOS applications. The project uses a two-process architecture with a TypeScript MCP server and a Swift executor.

## Architecture

- **MCP Server (TypeScript)**: Handles MCP protocol, tool registration, validation, policy enforcement, and configuration
- **Swift Executor**: Executes AppleScript commands via NSAppleScript and returns structured JSON results
- **Communication**: The Node process spawns the Swift executor and communicates via JSON over stdin/stdout

## Key Design Principles

1. **Security First**: Template-based execution, strict policy enforcement, no arbitrary scripts by default
2. **Structured Outputs**: All tools return both JSON data and human-readable summaries
3. **Policy-Based**: Per-app, per-tool allowlists with fine-grained control
4. **Type Safety**: Zod schemas for all inputs and configuration
5. **Monorepo Structure**: Separate packages for TypeScript and Swift components

## Technology Stack

- **Package Manager**: pnpm with workspaces
- **TypeScript**: Strict mode with comprehensive type checking
- **Testing**: node:test for TypeScript, XCTest for Swift
- **MCP SDK**: @modelcontextprotocol/sdk
- **Validation**: Zod schemas
- **Swift**: NSAppleScript for AppleScript execution

## Project Structure

- `packages/mcp-server/`: TypeScript MCP server implementation
  - `src/tools/`: Tool implementations (notes, calendar, mail, etc.)
  - `src/exec/`: Executor spawning and IPC handling
  - `src/policy/`: Permission and policy enforcement
  - `src/config/`: Configuration loading and validation
  - `src/templates/`: Parameterized AppleScript templates
- `packages/executor-swift/`: Swift executor CLI
  - `Sources/Executor/`: Main implementation
  - `Tests/`: Swift unit tests

## Development Guidelines

### TypeScript Conventions
- Use strict TypeScript settings
- Prefer explicit types over inference for public APIs
- Use Zod for runtime validation
- Keep functions small and focused
- Export types alongside implementations
- Use meaningful error messages with error codes

### Swift Conventions
- Follow Swift API Design Guidelines
- Use explicit error handling with typed errors
- Prefer value types (structs) where appropriate
- Document public APIs with doc comments
- Use modern Swift concurrency features where beneficial

### Testing Strategy
- Unit tests: Mock external dependencies, test logic in isolation
- Integration tests: Real AppleScript execution (macOS only, marked to skip in non-macOS CI)
- Test both success and error paths
- Include edge cases and validation failures

### Security Considerations
- Never log sensitive data (use redaction)
- Validate all inputs with Zod schemas
- Escape/sanitize parameters in AppleScript templates
- Enforce timeouts on all operations
- Use stable error codes for error handling
- Document TCC/automation permissions clearly

## Implementation Status

Currently in Phase 1: Repository setup and initial infrastructure.

## Key Files

- `pnpm-workspace.yaml`: Workspace configuration
- `packages/mcp-server/src/server.ts`: Main MCP server entry point
- `packages/executor-swift/Sources/Executor/main.swift`: Swift executor entry point
- `docs/`: Architecture and implementation documentation

## Common Commands

```bash
# Install dependencies
pnpm install

# Build all packages
pnpm build

# Run tests
pnpm test          # All tests
pnpm test:unit     # Unit tests only
pnpm test:integration  # Integration tests (macOS only)

# Lint and format
pnpm lint
pnpm format

# Clean build artifacts
pnpm clean
```

## Related Documentation

See the `docs/` directory for detailed architecture, implementation plans, and contracts:
- `ARCHITECTURE.md`: System architecture and data flow
- `IMPLEMENTATION.md`: Implementation details for Node and Swift
- `CONTRACTS.md`: IPC contract between Node and Swift
- `TOOLS.md`: Tool design principles and configuration
- `TESTING.md`: Testing strategy
