#!/usr/bin/env bash
#
# Build a self-contained macOS binary (Node.js SEA).
#
# Usage:
#   ./scripts/build-sea.sh
#
# Prerequisites:
#   - Node.js >= 20.12.0
#   - pnpm
#   - Xcode command-line tools (codesign)
#
# Output: dist/mcp-applescript (signed Mach-O executable)

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
DIST_DIR="$ROOT_DIR/dist"
MCP_PKG="$ROOT_DIR/packages/mcp-server"

BINARY_NAME="mcp-applescript"
SEA_CONFIG="$DIST_DIR/sea-config.json"
SEA_BLOB="$DIST_DIR/sea-prep.blob"
BUNDLE_CJS="$DIST_DIR/bundle.cjs"

echo "==> Preparing dist directory"
rm -rf "$DIST_DIR"
mkdir -p "$DIST_DIR"

# Step 1: Bundle TypeScript → CJS with esbuild
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

# Step 2: Generate SEA config
echo "==> Generating SEA config"
cat > "$SEA_CONFIG" <<EOF
{
  "main": "$BUNDLE_CJS",
  "output": "$SEA_BLOB",
  "disableExperimentalSEAWarning": true,
  "useSnapshot": false,
  "useCodeCache": true
}
EOF

# Step 3: Generate SEA blob
echo "==> Generating SEA blob"
cd "$DIST_DIR"
node --experimental-sea-config "$SEA_CONFIG"

# Step 4: Copy Node.js binary
echo "==> Copying Node.js binary"
NODE_BIN="$(which node)"
cp "$NODE_BIN" "$DIST_DIR/$BINARY_NAME"

# Step 5: Remove existing code signature (macOS requires this before injection)
echo "==> Removing existing signature"
codesign --remove-signature "$DIST_DIR/$BINARY_NAME"

# Step 6: Inject SEA blob with postject
echo "==> Injecting SEA blob"
npx postject "$DIST_DIR/$BINARY_NAME" NODE_SEA_BLOB "$SEA_BLOB" \
  --sentinel-fuse NODE_SEA_FUSE_fce680ab2cc467b6e072b8b5df1996b2 \
  --macho-segment-name NODE_SEA

# Step 7: Re-sign the binary (ad-hoc)
echo "==> Signing binary"
codesign --sign - "$DIST_DIR/$BINARY_NAME"

# Step 8: Verify
echo "==> Verifying binary"
FILE_INFO=$(file "$DIST_DIR/$BINARY_NAME")
SIZE=$(du -h "$DIST_DIR/$BINARY_NAME" | cut -f1)
echo "  Binary: $DIST_DIR/$BINARY_NAME"
echo "  Type:   $FILE_INFO"
echo "  Size:   $SIZE"

echo ""
echo "==> Build complete! Test with:"
echo "    $DIST_DIR/$BINARY_NAME"
