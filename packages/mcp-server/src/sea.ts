/**
 * SEA (Single Executable Application) entrypoint.
 *
 * When running as a SEA binary, the Swift executor is embedded as an asset.
 * This module extracts it to a temp directory on first run and configures
 * the executor path accordingly.
 */

import { existsSync, mkdirSync, writeFileSync, chmodSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { createHash } from "node:crypto";

// node:sea is only available in SEA builds. In the CJS bundle (SEA),
// esbuild keeps this as external. In ESM dev mode, we use createRequire.
import { createRequire } from "node:module";

let seaModule: { isSea(): boolean; getAsset(key: string): ArrayBuffer } | undefined;
try {
  const _require = typeof require === "function" ? require : createRequire(import.meta.url);
  seaModule = _require("node:sea") as typeof seaModule;
} catch {
  // Not available outside SEA context
}

/** Returns true if running as a Single Executable Application. */
export function isSea(): boolean {
  return seaModule?.isSea() === true;
}

/**
 * If running as SEA, extracts the embedded Swift executor binary to a
 * stable temp path and returns it. Otherwise returns undefined.
 */
export function extractExecutor(): string | undefined {
  if (!isSea() || !seaModule) return undefined;

  let asset: ArrayBuffer;
  try {
    asset = seaModule.getAsset("executor");
  } catch {
    return undefined;
  }

  const buf = Buffer.from(asset);
  const hash = createHash("sha256").update(buf).digest("hex").slice(0, 12);

  const dir = join(tmpdir(), "mcp-applescript");
  const binPath = join(dir, `applescript-executor-${hash}`);

  if (!existsSync(binPath)) {
    mkdirSync(dir, { recursive: true });
    writeFileSync(binPath, buf);
    chmodSync(binPath, 0o755);
  }

  return binPath;
}
