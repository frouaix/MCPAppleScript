# Repository layout (monorepo)

```
applescript-mcp/
  README.md
  LICENSE
  package.json
  pnpm-workspace.yaml
  .gitignore

  packages/
    mcp-server/
      src/
        index.ts              # entrypoint (stdio default, --http flag)
        server.ts             # MCP server setup + tool registration
        http.ts               # Streamable HTTP transport
        adapters/             # per-app resource adapters
          notes.ts
          calendar.ts
          reminders.ts
          mail.ts
          contacts.ts
          messages.ts
          photos.ts
          music.ts
          finder.ts
          safari.ts
        templates/            # AppleScript template builders
          index.ts            # dispatcher (routes by prefix)
          escape.ts           # shared escaping utilities
          notes.ts            # one per app...
          calendar.ts
          ...
        exec/
          executor.ts         # osascript execution via execFile
          types.ts            # request/response types
        policy/
          policy.ts           # allowlists/denylists + enforcement
        config/
          config.ts           # load/merge config (file/env)
          schema.ts           # zod schemas
        mode/
          mode.ts             # operation mode management
          confirmation.ts     # confirmation tokens
        util/
          json.ts
          errors.ts
          logging.ts
      test/
      tsconfig.json
```