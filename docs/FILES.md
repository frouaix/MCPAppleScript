# Repository layout (monorepo)

```
applescript-mcp/
  README.md
  LICENSE
  package.json
  pnpm-workspace.yaml (or npm workspaces)
  .gitignore

  packages/
    mcp-server/
      src/
        index.ts              # stdio entrypoint
        server.ts             # MCP server setup + tool registration
        tools/                # tool implementations
          app.ts
          calendar.ts
          mail.ts
          notes.ts
          generic.ts
        policy/
          policy.ts           # allowlists/denylists + enforcement
          prompts.ts          # optional user confirmation patterns
        exec/
          executor.ts         # spawn swift helper, handle IO, timeouts
          types.ts            # request/response types shared with tools
        config/
          config.ts           # load/merge config (file/env)
          schema.ts           # zod schemas
        util/
          json.ts
          errors.ts
          logging.ts
      test/
      tsconfig.json

    executor-swift/
      Package.swift
      Sources/Executor/
        main.swift            # JSON in/out, dispatch
        AppleScriptRunner.swift
        AppTargeting.swift    # app id/name handling
        Errors.swift
        JsonIO.swift
      Tests/ExecutorTests/
      ```