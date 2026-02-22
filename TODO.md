# TODO

## Next Steps

- [ ] **End-to-end testing with Copilot** — Test all 10 apps and 13 tools against real apps with real data to surface template bugs (#1)
- [ ] **Harden AppleScript JSON output** — Move JSON serialization from AppleScript string concatenation to the Swift layer to handle special characters (quotes, backslashes, newlines) robustly (#2)
- [ ] **Rebuild SEA binary** — Package the new 10-app version for distribution (`scripts/build-sea.sh` + `scripts/build-dmg.sh`) (#3)
- [ ] **Phase 23: YAML configuration support** — Allow YAML as an alternative config format (#4)
- [ ] **Phase 23: ScriptingBridge** — Use ScriptingBridge for better typed access to specific apps (#5)
- [ ] **Phase 23: XPC executor** — Replace CLI-based IPC with XPC for faster communication (#6)
