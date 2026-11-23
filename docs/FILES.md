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
    mcp-applescript           # SEA binary (Mach-O)
    CalendarBridge.app/       # Native EventKit helper, kept beside SEA binary
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
      native/                 # Swift EventKit/AppKit helper and build script

      src/
        index.ts              # Stdio entrypoint
        cli.ts                # Strict --profile argument parsing
        server.ts             # MCP server setup + tool registration

        tools/                # Tool registration modules
          index.ts
          system-tools.ts     # applescript.ping, get_permissions
          crud-tools.ts       # CRUD tool registrations

        adapters/             # per-app resource adapters
          types.ts            # ResourceAdapter, ValidationContext, ValidationResult
          registry.ts         # AppRegistry
          notes.ts
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
          executor.ts         # Dispatch to osascript or EventKit helper
          calendar-bridge.ts  # Native helper process and JSON transport
          types.ts            # ExecutorRequest/Response interfaces

        policy/
          policy.ts           # Immutable app grants and profile intersection

        config/
          config.ts           # load/merge config (file/env)
          schema.ts           # Zod app names, permissions, profiles, config

        mode/
          confirmation.ts     # User confirmation via form elicitation

        util/
          errors.ts           # McpAppleScriptError + typed error codes
          json.ts             # JSON utilities
          logging.ts          # Logger with field redaction

      test/
        unit/                 # unit tests (policy, config, executor, adapters, CLI,
          adapters.test.ts    #   confirmation, errors, json, logging, server,
          cli.test.ts
          config-loading.test.ts  #   validation)
          config-schema.test.ts
          confirmation.test.ts
          crud-tools.test.ts   # Protocol confirmation flow without app execution
          errors.test.ts
          executor.test.ts
          json.test.ts
          logging.test.ts
          policy.test.ts
          server.test.ts
          validation.test.ts
        integration/          # Stdio protocol tests and opt-in real-app reads
          e2e-apps.test.ts
          server.test.ts

      dist/                   # compiled JS output (tsc)
```
