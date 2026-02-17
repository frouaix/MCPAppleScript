# Contributing to MCP-AppleScript

## Development Setup

```bash
# Clone the repository
git clone https://github.com/frouaix/MCPAppleScript.git
cd MCPAppleScript

# Install dependencies
pnpm install

# Build everything
pnpm build
```

## Project Structure

- `packages/mcp-server/` — TypeScript MCP server (Node.js)
- `packages/executor-swift/` — Swift executor for AppleScript execution
- `docs/` — Architecture and design documentation

## Running Tests

```bash
# Unit tests only (fast, no macOS APIs needed)
pnpm test:unit

# Integration tests (requires macOS + TCC permissions)
pnpm test:integration

# All tests
pnpm test
```

## Code Style

### TypeScript
- Strict TypeScript (`strict: true`)
- Prettier for formatting
- ESLint for linting
- Use `node:test` for testing (no external test frameworks)

### Swift
- Standard Swift conventions
- Foundation/AppKit for AppleScript APIs
- Use `swift build` for building

## Making Changes

1. Create a branch from `main`
2. Make your changes
3. Run `pnpm build && pnpm test` to verify
4. Open a pull request

## Adding a New Tool

1. Register the tool in `packages/mcp-server/src/server.ts` with a Zod input schema
2. Add the corresponding template in `packages/executor-swift/Sources/Executor/AppleScriptRunner.swift`
3. Update the Swift request dispatcher in `main.swift`
4. Add policy configuration for the target app
5. Write unit tests and integration tests
6. Update README.md with the new tool

## IPC Contract

The TypeScript server communicates with the Swift executor via JSON over stdin/stdout:

**Request** (server → executor):
```json
{
  "action": "template",
  "templateId": "notes.create_note",
  "bundleId": "com.apple.Notes",
  "params": { "title": "Hello", "body": "World" }
}
```

**Response** (executor → server):
```json
{
  "ok": true,
  "result": { "noteId": "..." },
  "humanSummary": "Created note 'Hello' in Notes"
}
```

## License

By contributing, you agree that your contributions will be licensed under the MIT License.
