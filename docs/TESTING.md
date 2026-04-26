# Testing

### Unit tests (Node, macOS or Linux)

Run: `pnpm test:unit` (or `pnpm test`)

Tests cover:

| Module | Tests |
|--------|-------|
| **Adapters** | All 10 adapters: info correctness, template IDs, parameter passing, unsupported operations |
| **Config** | Config file loading, env var override, schema validation, defaults |
| **Validation** | Finder path allowlist (empty deny, allowed/denied paths, `~` resolution, subpaths, `properties.parentPath/destPath`, action params), Safari `do_javascript` gating, `runValidation` helper behavior |
| **Executor** | Dry run (template + raw), osascript execution, error classification, timeouts, non-JSON output |
| **Mode** | Default readonly, custom default, setMode, listeners, enabled/disabled tools, tool-to-mode map, destructive flags |
| **Confirmation** | Token issuance, acceptance, single-use consumption, action mismatch, expiration, invalid tokens |
| **Policy** | Tools without bundleId, app-scoped tools (enabled/disabled/configured), run_script gating, helper methods |
| **Errors** | McpAppleScriptError, PolicyDeniedError, ExecutorError, ConfigError, JSON serialization |
| **JSON** | safeJsonParse (valid/invalid/arrays/primitives), safeJsonStringify (objects/pretty/circular) |
| **Logging** | Log levels, field redaction, nested redaction |
| **Server** | Server creation |

### Integration tests (macOS only)

Run: `pnpm test:integration`

- E2E tests for all 10 apps (Notes, Calendar, Reminders, Mail, Contacts, Messages, Photos, Music, Finder, Safari)
- MCP server protocol tests (stdio transport, tool registration, tool calling)
- Gated behind `APPLESCRIPT_E2E` env var; skipped in CI unless explicitly enabled
