# PLAN
## Milestone 1: skeleton + “ping”
- Create workspace + build scripts.
- Implement MCP server that exposes:
- applescript.ping → returns { ok: true, version }.

## Milestone 2: executor wiring
- Build Swift executor as a CLI.
- Add executor.ts spawn + JSON IO.
- Add tool applescript.run_script but keep it hard-disabled unless config enables it.
- Verify end-to-end with a harmless script (e.g., return "hello").

## Milestone 3: first real app tool (Notes)
- Add notes.create_note template:
- parameters: title, body
- returns: created note identifier or a best-effort response
- Add allowlist policy entry for Notes.

## Milestone 4: Calendar
- Add calendar.create_event template:
- parameters: calendarName, title, start, end, location, notes
- Use ISO timestamps and time zone rules.

## Milestone 5: hardening
- Redaction in logs.
- Stable error codes.
- Comprehensive schema validation.
- dryRun mode for tools where possible (return the script that would run).