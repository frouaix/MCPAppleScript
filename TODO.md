# TODO

## Next Steps

- [ ] **End-to-end testing with Claude Desktop** — Test all 10 apps and 13 tools against real apps with real data to surface template bugs
- [ ] **Harden AppleScript JSON output** — Move JSON serialization from AppleScript string concatenation to the Swift layer to handle special characters (quotes, backslashes, newlines) robustly
- [ ] **Rebuild SEA binary** — Package the new 10-app version for distribution (`scripts/build-sea.sh` + `scripts/build-dmg.sh`)
- [ ] **Phase 23: YAML configuration support** — Allow YAML as an alternative config format
- [ ] **Phase 23: ScriptingBridge** — Use ScriptingBridge for better typed access to specific apps
- [ ] **Phase 23: XPC executor** — Replace CLI-based IPC with XPC for faster communication
