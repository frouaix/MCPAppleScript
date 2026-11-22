# Testing

## Unit tests

Run `pnpm test:unit`.

Tests use `node:test` and cover adapters, configuration, CLI flags, permissions,
confirmation, executor behavior, errors, JSON, logging, and adapter validation.
Policy tests exercise all ten apps at every permission level, global overrides,
all ceiling/profile combinations, immutable grants, and simultaneous profile isolation.
Finder tests cover traversal, symlinks, root grants, default paths, and path resolution.
Executor tests invoke simple non-app AppleScript on macOS.

## Protocol integration tests

Run `pnpm test:integration`.

Tests launch independent stdio server processes with temporary configuration through
the MCP SDK client. They verify startup, tool discovery, simultaneous profile isolation,
read/write/off boundaries for every CRUD tool, the global ceiling, read-only action
classification, missing confirmation support, removed escalation/execution tools,
and explicit startup failures.

App operation tests use dry runs or guaranteed pre-execution denials; they do not read
or write personal app data. They do not inherit the user's configured permissions.

## Real-app acceptance tests (macOS, opt-in)

Run `APPLESCRIPT_E2E=1 pnpm test:integration` locally, with `CI` unset.

These tests grant a dedicated profile read access to all supported apps using temporary
configuration. Finder gets an explicit home-directory allowlist. Tests read real
containers, may trigger macOS Automation consent prompts, and assert structured output.
They never write app data. Errors are failures rather than accepted substitutes for
working app communication.

They are always skipped in CI. Passing unit/protocol tests does not prove that each
app's AppleScript dictionary or behavior is compatible with the installed macOS version.
