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
  - `src/adapters/` — Per-app resource adapters
  - `src/templates/` — AppleScript template builders (one per app)
  - `src/exec/` — osascript executor
  - `src/http.ts` — Streamable HTTP transport
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

## Making Changes

1. Create a branch from `main`
2. Make your changes
3. Run `pnpm build && pnpm test` to verify
4. Open a pull request

## Adding a New App

1. Create `packages/mcp-server/src/adapters/{app}.ts` implementing `ResourceAdapter`
2. Register in `adapters/index.ts` and `server.ts`
3. Create `packages/mcp-server/src/templates/{app}.ts` with `export function build()`
4. Add to the `builders` map in `templates/index.ts`
5. Add policy configuration for the target app
6. Write unit tests and integration tests
7. Update README.md with the new app

## License

By contributing, you agree that your contributions will be licensed under the MIT License.
