#!/usr/bin/env bash
#
# Create a .dmg installer from the SEA binary.
#
# Usage:
#   ./scripts/build-sea.sh              # First, build the binary
#   ./scripts/build-dmg.sh              # Then, create the .dmg
#   ./scripts/build-dmg.sh --version 1.0.0
#
# Output: dist/MCP-AppleScript-<version>-<arch>.dmg

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
DIST_DIR="$ROOT_DIR/dist"
BINARY="$DIST_DIR/mcp-applescript"

VERSION=""
while [[ $# -gt 0 ]]; do
  case "$1" in
    --version) VERSION="$2"; shift 2 ;;
    *) echo "Unknown option: $1"; exit 1 ;;
  esac
done

if [[ -z "$VERSION" ]]; then
  VERSION=$(node -e "console.log(require('$ROOT_DIR/packages/mcp-server/package.json').version)")
fi

if [[ ! -f "$BINARY" ]]; then
  echo "Error: $BINARY not found. Run ./scripts/build-sea.sh first."
  exit 1
fi

ARCH=$(uname -m)
DMG_NAME="MCP-AppleScript-${VERSION}-${ARCH}.dmg"
DMG_PATH="$DIST_DIR/$DMG_NAME"
STAGING="$DIST_DIR/dmg-staging"

echo "==> Creating .dmg: $DMG_NAME"

# Clean staging area
rm -rf "$STAGING" "$DMG_PATH"
mkdir -p "$STAGING"

# Copy binary
cp "$BINARY" "$STAGING/mcp-applescript"

# Create a README for the DMG
cat > "$STAGING/INSTALL.txt" <<'INSTALL_EOF'
MCP-AppleScript Bridge Server
==============================

Installation:
  1. Copy "mcp-applescript" to /usr/local/bin/ (or another directory in your PATH):
       sudo cp mcp-applescript /usr/local/bin/

  2. Create a config file at ~/.config/mcp-applescript/config.json:
       mkdir -p ~/.config/mcp-applescript
       cat > ~/.config/mcp-applescript/config.json << 'EOF'
       {
         "defaultMode": "readonly",
         "apps": {
           "com.apple.Notes": { "enabled": true, "allowedTools": ["notes.create_note"] },
           "com.apple.Calendar": { "enabled": true, "allowedTools": ["calendar.create_event"] },
           "com.apple.Mail": { "enabled": true, "allowedTools": ["mail.compose_draft"] }
         }
       }
       EOF

  3. Add to your MCP client config (e.g., Claude Desktop):
       {
         "mcpServers": {
           "applescript": {
             "command": "/usr/local/bin/mcp-applescript"
           }
         }
       }

  4. Grant macOS automation permissions when prompted (System Settings > Privacy & Security > Automation).

For full documentation, visit: https://github.com/frouaix/MCPAppleScript
INSTALL_EOF

# Create .dmg using hdiutil
echo "==> Packaging with hdiutil"
hdiutil create \
  -volname "MCP-AppleScript $VERSION" \
  -srcfolder "$STAGING" \
  -ov \
  -format UDZO \
  "$DMG_PATH"

# Clean up staging
rm -rf "$STAGING"

SIZE=$(du -h "$DMG_PATH" | cut -f1)
echo ""
echo "==> DMG created:"
echo "  Path: $DMG_PATH"
echo "  Size: $SIZE"
