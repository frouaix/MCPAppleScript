# Contracts

## Executor Request/Response

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

### Success Response
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

Error codes: `AUTOMATION_DENIED`, `APP_NOT_RUNNING`, `SCRIPT_ERROR`, `TIMEOUT`, `INVALID_REQUEST`, `EXECUTOR_FAILED`