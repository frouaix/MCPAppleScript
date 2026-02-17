#!/usr/bin/env bash
#
# Build a self-contained macOS binary (Node.js SEA) with the Swift executor embedded.
#
# Usage:
#   ./scripts/build-sea.sh            # Builds for current architecture
#   ./scripts/build-sea.sh --arch arm64
#   ./scripts/build-sea.sh --arch x86_64
#
# Prerequisites:
#   - Node.js >= 20.12.0
#   - pnpm
#   - Swift toolchain
#   - Xcode command-line tools (codesign)
#
# Output: dist/mcp-applescript (signed Mach-O executable)

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
DIST_DIR="$ROOT_DIR/dist"
MCP_PKG="$ROOT_DIR/packages/mcp-server"
SWIFT_PKG="$ROOT_DIR/packages/executor-swift"

BINARY_NAME="mcp-applescript"
SEA_CONFIG="$DIST_DIR/sea-config.json"
SEA_BLOB="$DIST_DIR/sea-prep.blob"
BUNDLE_CJS="$DIST_DIR/bundle.cjs"
EXECUTOR_BIN="$DIST_DIR/applescript-executor"

ARCH=""
while [[ $# -gt 0 ]]; do
  case "$1" in
    --arch) ARCH="$2"; shift 2 ;;
    *) echo "Unknown option: $1"; exit 1 ;;
  esac
done

echo "==> Preparing dist directory"
rm -rf "$DIST_DIR"
mkdir -p "$DIST_DIR"

# Step 1: Build Swift executor
echo "==> Building Swift executor"
cd "$SWIFT_PKG"
if [[ -n "$ARCH" ]]; then
  swift build -c release --arch "$ARCH"
else
  swift build -c release
fi
cp "$(swift build -c release --show-bin-path)/applescript-executor" "$EXECUTOR_BIN"

# Step 2: Bundle TypeScript → CJS with esbuild
echo "==> Bundling TypeScript with esbuild"
cd "$MCP_PKG"
npx esbuild src/index.ts \
  --bundle \
  --platform=node \
  --target=node20 \
  --format=cjs \
  --outfile="$BUNDLE_CJS" \
  --packages=bundle \
  --external:node:sea \
  --external:node:module

# Step 3: Generate SEA config
echo "==> Generating SEA config"
cat > "$SEA_CONFIG" <<EOF
{
  "main": "$BUNDLE_CJS",
  "output": "$SEA_BLOB",
  "disableExperimentalSEAWarning": true,
  "useSnapshot": false,
  "useCodeCache": true,
  "assets": {
    "executor": "$EXECUTOR_BIN"
  }
}
EOF

# Step 4: Generate SEA blob
echo "==> Generating SEA blob"
cd "$DIST_DIR"
node --experimental-sea-config "$SEA_CONFIG"

# Step 5: Copy Node.js binary
echo "==> Copying Node.js binary"
NODE_BIN="$(which node)"
cp "$NODE_BIN" "$DIST_DIR/$BINARY_NAME"

# Step 6: Remove existing code signature (macOS requires this before injection)
echo "==> Removing existing signature"
codesign --remove-signature "$DIST_DIR/$BINARY_NAME"

# Step 7: Inject SEA blob with postject
echo "==> Injecting SEA blob"
npx postject "$DIST_DIR/$BINARY_NAME" NODE_SEA_BLOB "$SEA_BLOB" \
  --sentinel-fuse NODE_SEA_FUSE_fce680ab2cc467b6e072b8b5df1996b2 \
  --macho-segment-name NODE_SEA

# Step 8: Re-sign the binary (ad-hoc)
echo "==> Signing binary"
codesign --sign - "$DIST_DIR/$BINARY_NAME"

# Step 9: Verify
echo "==> Verifying binary"
FILE_INFO=$(file "$DIST_DIR/$BINARY_NAME")
SIZE=$(du -h "$DIST_DIR/$BINARY_NAME" | cut -f1)
echo "  Binary: $DIST_DIR/$BINARY_NAME"
echo "  Type:   $FILE_INFO"
echo "  Size:   $SIZE"

echo ""
echo "==> Build complete! Test with:"
echo "    $DIST_DIR/$BINARY_NAME"
