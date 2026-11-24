#!/bin/bash
set -euo pipefail

HERE="$(cd "$(dirname "$0")" && pwd)"
PACKAGE_DIR="$(cd "$HERE/.." && pwd)"
APP="$PACKAGE_DIR/dist/CalendarBridge.app"
mkdir -p "$APP/Contents/MacOS"
cp "$HERE/CalendarBridge/Info.plist" "$APP/Contents/Info.plist"
swiftc -parse-as-library "$HERE/CalendarBridge/main.swift" -o "$APP/Contents/MacOS/CalendarBridge"
codesign --force --sign - "$APP"
