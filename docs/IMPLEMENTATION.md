## Swift executor implementation plan

### Execution method

Start with NSAppleScript for template scripts and/or raw script strings:
- Pros: straightforward
- Cons: less structured access, but acceptable for v1

Later, if needed:
- ScriptingBridge for richer interactions with specific apps.

### Key responsibilities
- Resolve app target by bundle id (prefer bundle id over app name).
- Run AppleScript with a timeout:
   - For CLI timeout, implement in Node by killing the process.
- Map common Apple Events/TCC errors (not authorized, app not running, etc.) into stable error codes.

### Automation permissions (TCC)

On first use, macOS prompts for automation permission (“App wants to control…”). This depends on which process is sending Apple Events:
- If the Swift executor sends Apple Events, the executor binary will trigger TCC.
- Expect users to approve it in System Settings → Privacy & Security → Automation.

Document this in README as part of setup.

## Node/TypeScript MCP server implementation plan

### Core modules
1.	server.ts
    - Initialize MCP server with stdio transport.
    - Register tools with JSON schemas (use zod → JSON schema if desired).
1.	config/config.ts
    - Load config file; merge defaults; validate with zod.
1.	policy/policy.ts
    - assertAllowed(toolName, bundleId, args); throw typed errors.
1.	exec/executor.ts
    - runExecutor(request): Promise<Response>
    - Spawn swift binary
    - Write request JSON
    - Read response JSON
    - Enforce timeout (kill process)
1.	tools/*
    - Each tool:
       - Validate args
       - Construct executor request
       - Map executor response to MCP tool result

### Tool result shape
Return:
- content: a short text summary
- structured: the JSON result for downstream automation
