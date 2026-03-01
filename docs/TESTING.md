# Testing

### Unit tests (Node)
- Policy enforcement (allow/deny cases).
- Config validation.
- Executor request/response parsing (dry run, osascript errors, timeouts).
- Template builders (verify generated AppleScript).
- Tool arg validation.

### Integration tests (macOS only)
- Mark as `pnpm test:integration` and skip in CI unless macOS runner.
- Use a dedicated test AppleScript that doesn't modify user data where possible.
