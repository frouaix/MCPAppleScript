# TESTING

### Unit tests (Node)
- Policy enforcement (allow/deny cases).
- Config validation.
- Executor request/response parsing.
- Tool arg validation.

### Integration tests (macOS only)
- Mark as npm run test:integration and skip in CI unless macOS runner.
- Use a dedicated test AppleScript that doesn’t modify user data where possible.

### Swift tests
- JSON parsing and error mapping.
- Script execution with a safe script.
