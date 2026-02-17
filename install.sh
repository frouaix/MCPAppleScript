#!/bin/bash
set -e

# MCP-AppleScript Install Script
# Builds and installs the MCP server and Swift executor

REPO_DIR="$(cd "$(dirname "$0")" && pwd)"
CONFIG_DIR="$HOME/.config/applescript-mcp"
EXECUTOR_INSTALL_PATH="/usr/local/bin/applescript-executor"

echo "🔧 MCP-AppleScript Installer"
echo "=============================="
echo ""

# Check prerequisites
command -v node >/dev/null 2>&1 || { echo "❌ Node.js is required. Install from https://nodejs.org"; exit 1; }
command -v pnpm >/dev/null 2>&1 || { echo "❌ pnpm is required. Install with: npm install -g pnpm"; exit 1; }
command -v swift >/dev/null 2>&1 || { echo "❌ Swift is required. Install Xcode Command Line Tools."; exit 1; }

NODE_VERSION=$(node --version)
SWIFT_VERSION=$(swift --version 2>&1 | head -1)
echo "✓ Node.js $NODE_VERSION"
echo "✓ $SWIFT_VERSION"
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

# Build Swift executor
echo "🏗️  Building Swift executor..."
cd "$REPO_DIR/packages/executor-swift"
swift build -c release
echo ""

# Install executor binary
echo "📥 Installing executor binary..."
EXECUTOR_BIN="$REPO_DIR/packages/executor-swift/.build/release/applescript-executor"
if [ -f "$EXECUTOR_BIN" ]; then
    sudo cp "$EXECUTOR_BIN" "$EXECUTOR_INSTALL_PATH"
    sudo chmod +x "$EXECUTOR_INSTALL_PATH"
    echo "✓ Installed to $EXECUTOR_INSTALL_PATH"
else
    echo "⚠️  Release binary not found, trying debug build..."
    EXECUTOR_BIN="$REPO_DIR/packages/executor-swift/.build/debug/applescript-executor"
    if [ -f "$EXECUTOR_BIN" ]; then
        sudo cp "$EXECUTOR_BIN" "$EXECUTOR_INSTALL_PATH"
        sudo chmod +x "$EXECUTOR_INSTALL_PATH"
        echo "✓ Installed to $EXECUTOR_INSTALL_PATH"
    else
        echo "❌ Could not find executor binary"
        exit 1
    fi
fi
echo ""

# Create config directory and default config
echo "⚙️  Setting up configuration..."
mkdir -p "$CONFIG_DIR"
if [ ! -f "$CONFIG_DIR/config.json" ]; then
    cat > "$CONFIG_DIR/config.json" << 'EOF'
{
  "executorPath": "/usr/local/bin/applescript-executor",
  "defaultTimeoutMs": 12000,
  "apps": {
    "com.apple.Notes": {
      "enabled": true,
      "allowedTools": ["notes.create_note", "applescript.run_template"]
    },
    "com.apple.iCal": {
      "enabled": true,
      "allowedTools": ["calendar.create_event"]
    },
    "com.apple.mail": {
      "enabled": true,
      "allowedTools": ["mail.compose_draft"]
    }
  },
  "runScript": {
    "enabled": false,
    "allowedBundleIds": []
  },
  "logging": {
    "level": "info",
    "redact": ["email", "content", "body"]
  }
}
EOF
    echo "✓ Created default config at $CONFIG_DIR/config.json"
else
    echo "✓ Config already exists at $CONFIG_DIR/config.json"
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
echo "        \"args\": [\"$REPO_DIR/packages/mcp-server/dist/index.js\"]"
echo "      }"
echo "    }"
echo "  }"
echo ""
echo "⚠️  On first use, macOS will prompt for Automation permissions."
echo "   Go to System Settings → Privacy & Security → Automation to manage."
echo ""
