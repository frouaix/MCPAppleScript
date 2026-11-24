#!/bin/bash
set -e

# MCP-AppleScript Install Script
# Builds and installs the MCP server

REPO_DIR="$(cd "$(dirname "$0")" && pwd)"
CONFIG_DIR="$HOME/.config/applescript-mcp"

echo "🔧 MCP-AppleScript Installer"
echo "=============================="
echo ""

# Check prerequisites
command -v node >/dev/null 2>&1 || { echo "❌ Node.js is required. Install from https://nodejs.org"; exit 1; }
command -v pnpm >/dev/null 2>&1 || { echo "❌ pnpm is required. Install with: npm install -g pnpm"; exit 1; }
command -v swiftc >/dev/null 2>&1 || { echo "❌ swiftc is required. Install Xcode command-line tools."; exit 1; }
command -v codesign >/dev/null 2>&1 || { echo "❌ codesign is required. Install Xcode command-line tools."; exit 1; }

NODE_VERSION=$(node --version)
node -e 'const [major, minor] = process.versions.node.split(".").map(Number); if (major < 20 || (major === 20 && minor < 12)) { console.error("Node.js 20.12.0 or newer is required."); process.exit(1); }'
echo "✓ Node.js $NODE_VERSION"
echo ""

# Install Node dependencies
echo "📦 Installing Node.js dependencies..."
cd "$REPO_DIR"
pnpm install --frozen-lockfile 2>/dev/null || pnpm install
echo ""

# Build TypeScript
echo "🏗️  Building TypeScript MCP server..."
cd "$REPO_DIR/packages/mcp-server"
pnpm build
echo ""

# Create config directory and default config
echo "⚙️  Setting up configuration..."
mkdir -p "$CONFIG_DIR"
if [ ! -f "$CONFIG_DIR/config.json" ]; then
    cat > "$CONFIG_DIR/config.json" << 'EOF'
{
  "defaultTimeoutMs": 12000,
  "permissions": {
    "default": "off",
    "apps": {}
  },
  "profiles": {
    "research": {
      "default": "off",
      "apps": { "notes": "read", "calendar": "read" }
    }
  },
  "logging": {
    "level": "info",
    "redact": ["email", "content", "body"]
  }
}
EOF
    echo "✓ Created config at $CONFIG_DIR/config.json (all access off until you grant permissions)"
else
    echo "✓ Existing config preserved at $CONFIG_DIR/config.json"
    echo '  Legacy apps/modes/runScript configurations must be migrated to permissions/profiles.'
fi
echo ""

# Print usage info
echo "=============================="
echo "✅ Installation complete!"
echo ""
echo "To use with Claude Desktop, add to ~/Library/Application Support/Claude/claude_desktop_config.json:"
echo ""
echo "  {"
echo "    \"mcpServers\": {"
echo "      \"applescript\": {"
echo "        \"command\": \"node\","
echo "        \"args\": [\"$REPO_DIR/packages/mcp-server/dist/index.js\", \"--profile\", \"research\"]"
echo "      }"
echo "    }"
echo "  }"
echo ""
echo 'Grant app access in the config permissions ceiling before using a profile. See README.md.'
echo "⚠️  On first use, macOS will prompt for Automation permissions."
echo "   Go to System Settings → Privacy & Security → Automation to manage."
echo "   Calendar also requires Calendar Full Access for the Calendar Bridge."
echo ""
