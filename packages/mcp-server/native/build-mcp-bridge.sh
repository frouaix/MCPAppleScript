#!/bin/bash
set -euo pipefail

HERE="$(cd "$(dirname "$0")" && pwd)"
PACKAGE_DIR="$(cd "$HERE/.." && pwd)"
APP="$PACKAGE_DIR/dist/MCPBridge.app"
mkdir -p "$APP/Contents/MacOS"
cp "$HERE/MCPBridge/Info.plist" "$APP/Contents/Info.plist"
swiftc -parse-as-library "$HERE/MCPBridge/main.swift" "$HERE/MCPBridge/Reminders.swift" "$HERE/MCPBridge/Contacts.swift" "$HERE/MCPBridge/Photos.swift" -o "$APP/Contents/MacOS/MCPBridge"
codesign --force --sign - "$APP"
