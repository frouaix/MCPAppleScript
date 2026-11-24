# Contracts

## Executor Request/Response

These are internal TypeScript contracts, not MCP tools or an IPC service.
Raw execution is used only by internal executor tests; clients cannot submit raw
scripts, template IDs, or bundle IDs directly.

### ExecutorRequest

```json
{
  "requestId": "uuid",
  "bundleId": "com.apple.Notes",
  "mode": "template",
  "templateId": "notes.create_note",
  "parameters": {
    "title": "Test",
    "body": "Hello"
  },
  "timeoutMs": 12000,
  "dryRun": false
}
```

**Fields:**
| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `requestId` | string (UUID) | Yes | Unique request identifier |
| `bundleId` | string | Yes | Target app bundle ID (e.g. `com.apple.Notes`) |
| `mode` | `"template"` \| `"raw"` | Yes | `template` uses template builder; `raw` executes script directly |
| `templateId` | string | Conditional | Required when `mode: "template"` (e.g. `notes.list_notes`) |
| `parameters` | object | Yes | Template parameters |
| `script` | string | Conditional | Required when `mode: "raw"` — raw AppleScript source |
| `timeoutMs` | number | Yes | Max execution time in ms (default: 12000) |
| `dryRun` | boolean | No | If true, returns the generated script or EventKit plan without executing |

### Success Response (template mode)

```json
{
  "requestId": "uuid",
  "ok": true,
  "result": {
    "noteId": "x-coredata://....",
    "createdAt": "2026-02-16T22:10:00Z"
  },
  "stdout": "...",
  "stderr": ""
}
```

### Success Response (raw mode, dry run)

```json
{
  "requestId": "uuid",
  "ok": true,
  "result": {
    "script": "tell application \"Notes\"..."
  },
  "stdout": "",
  "stderr": ""
}
```

### Error Response

```json
{
  "requestId": "uuid",
  "ok": false,
  "error": {
    "code": "AUTOMATION_DENIED",
    "message": "Not authorized to send Apple Events to com.apple.Notes"
  }
}
```

### Error Codes

| Code | Description |
|------|-------------|
| `AUTOMATION_DENIED` | macOS automation permission denied (-1743) |
| `APP_NOT_RUNNING` | Target app is not running (-600, -10810) |
| `SCRIPT_ERROR` | AppleScript compilation or runtime error |
| `TIMEOUT` | Operation exceeded `timeoutMs` (killed by SIGKILL) |
| `INVALID_REQUEST` | Missing required field (e.g. `templateId` in template mode) |
| `EXECUTOR_FAILED` | Helper failure, invalid helper output, or failure to spawn the process |
