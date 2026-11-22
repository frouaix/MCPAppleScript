import { readFileSync, existsSync } from "node:fs";
import { resolve, join } from "node:path";
import { homedir } from "node:os";
import { Config, ConfigSchema, DEFAULT_CONFIG } from "./schema.js";
import { safeJsonParse } from "../util/json.js";
import { ConfigError } from "../util/errors.js";

const DEFAULT_CONFIG_PATH = join(homedir(), ".config", "applescript-mcp", "config.json");
const CONFIG_ENV_VAR = "APPLESCRIPT_MCP_CONFIG";

export function resolveConfigPath(): string | undefined {
  const envPath = process.env[CONFIG_ENV_VAR];
  if (envPath && envPath.length > 0) {
    const resolved = resolve(envPath);
    if (existsSync(resolved)) return resolved;
    throw new ConfigError(`Config file not found at APPLESCRIPT_MCP_CONFIG path: ${envPath}`);
  }

  if (existsSync(DEFAULT_CONFIG_PATH)) return DEFAULT_CONFIG_PATH;

  return undefined;
}

export function loadConfigFromFile(path: string): unknown {
  const raw = readFileSync(path, "utf-8");
  const parsed = safeJsonParse(raw);
  if (!parsed.ok) {
    throw new ConfigError(`Failed to parse config file ${path}: ${parsed.error}`);
  }
  return parsed.value;
}

export function loadConfig(): Config {
  const configPath = resolveConfigPath();
  if (!configPath) return DEFAULT_CONFIG;

  const raw = loadConfigFromFile(configPath);
  if (raw && typeof raw === "object") {
    const legacy = ["apps", "modes", "defaultMode", "runScript", "executorPath"].filter(
      (key) => key in raw
    );
    if (legacy.length > 0) {
      throw new ConfigError(
        `Legacy config keys at ${configPath}: ${legacy.join(", ")}. Replace them with "permissions" and "profiles" using app names (e.g. notes), not bundle IDs. See README.md for migration.`
      );
    }
  }
  const result = ConfigSchema.safeParse(raw);

  if (!result.success) {
    const issues = result.error.issues.map((i) => `  ${i.path.join(".")}: ${i.message}`);
    throw new ConfigError(`Invalid config at ${configPath}:\n${issues.join("\n")}`);
  }

  return result.data;
}
