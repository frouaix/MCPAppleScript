# Repository layout (monorepo)

```
applescript-mcp/
  README.md
  SCENARIO.md
  CONTRIBUTING.md
  LICENSE
  install.sh
  package.json
  pnpm-workspace.yaml
  pnpm-lock.yaml
  .gitignore

  .github/
    copilot-instructions.md
    workflows/
      ci.yml
      release.yml

  dist/
    bundle.cjs              # esbuild-bundled CJS
    mcp-applescript           # SEA self-contained binary (Mach-O)
    sea-config.json           # Node.js SEA configuration
    sea-prep.blob             # Prepared SEA blob

  docs/
    ARCHITECTURE.md
    CONTRACTS.md
    FILES.md
    TESTING.md
    TOOLS.md

  scripts/
    build-sea.sh              # Build SEA binary
    build-dmg.sh              # Build .dmg installer

  packages/
    mcp-server/
      package.json
      tsconfig.json
      eslint.config.js
      .prettierrc

      src/
        index.ts              # CLI entrypoint (stdio default, --http flag)
        server.ts             # MCP server setup + tool registration
        http.ts               # Streamable HTTP transport (Express)

        tools/                # Tool registration modules
          index.ts
          system-tools.ts     # applescript.ping, get_mode, set_mode
          crud-tools.ts       # CRUD tool registrations
          script-tools.ts     # run_template, run_script

        adapters/             # per-app resource adapters
          types.ts            # ResourceAdapter, ValidationContext, ValidationResult
          registry.ts         # AppRegistry
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
          escape.ts           # esc(), wrapScript(), jsonEscHandlers
          notes.ts            # one per app...
          calendar.ts
          reminders.ts
          mail.ts
          contacts.ts
          messages.ts
          photos.ts
          music.ts
          finder.ts
          safari.ts

        exec/
          executor.ts         # osascript execution via execFile
          types.ts            # ExecutorRequest/Response interfaces

        policy/
          policy.ts           # allowlists/denylists + enforcement

        config/
          config.ts           # load/merge config (file/env)
          schema.ts           # zod schemas (AppConfig, FinderConfig, SafariConfig, etc.)

        mode/
          mode.ts             # operation mode management (readonly/create/full)
          confirmation.ts     # confirmation tokens + elicitation

        util/
          errors.ts           # McpAppleScriptError + typed error codes
          json.ts             # JSON utilities
          logging.ts          # Logger with field redaction

      test/
        unit/                 # unit tests (policy, config, executor, adapters, mode,
          adapters.test.ts    #   confirmation, errors, json, logging, server,
          config-loading.test.ts  #   validation)
          config-schema.test.ts
          confirmation.test.ts
          errors.test.ts
          executor.test.ts
          json.test.ts
          logging.test.ts
          mode.test.ts
          policy.test.ts
          server.test.ts
          validation.test.ts
        integration/          # macOS-only e2e tests
          e2e-apps.test.ts
          server.test.ts

      dist/                   # compiled JS output (tsc)
```
