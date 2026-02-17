# Contracts

## IPC contract: Node ⇄ Swift executor

### Request JSON
```
{
  "requestId": "uuid",
  "bundleId": "com.apple.Notes",
  "mode": "template",
  "templateId": "notes.create_note.v1",
  "parameters": {
    "title": "Test",
    "body": "Hello"
  },
  "timeoutMs": 12000
}
```

### Response JSON
```
{
  "requestId": "uuid",
  "ok": true,
  "result": {
    "noteId": "x-coredata://....",
    "createdAt": "2026-02-16T22:10:00Z"
  },
  "stdout": "",
  "stderr": ""
}
```

### Error response JSON
```
{
  "requestId": "uuid",
  "ok": false,
  "error": {
    "code": "AUTOMATION_DENIED",
    "message": "Not authorized to send Apple Events to com.apple.Notes",
    "details": { "osStatus": -1743 }
  }
}
```