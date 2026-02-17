import { LoggingConfig } from "../config/schema.js";

export type LogLevel = "debug" | "info" | "warn" | "error";

const LOG_LEVEL_ORDER: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
};

export class Logger {
  private readonly level: LogLevel;
  private readonly redactKeys: Set<string>;

  constructor(config: LoggingConfig = { level: "info", redact: [] }) {
    this.level = config.level;
    this.redactKeys = new Set(config.redact);
  }

  debug(message: string, data?: Record<string, unknown>): void {
    this.log("debug", message, data);
  }

  info(message: string, data?: Record<string, unknown>): void {
    this.log("info", message, data);
  }

  warn(message: string, data?: Record<string, unknown>): void {
    this.log("warn", message, data);
  }

  error(message: string, data?: Record<string, unknown>): void {
    this.log("error", message, data);
  }

  private log(level: LogLevel, message: string, data?: Record<string, unknown>): void {
    if (LOG_LEVEL_ORDER[level] < LOG_LEVEL_ORDER[this.level]) return;

    const entry = {
      ts: new Date().toISOString(),
      level,
      msg: message,
      ...(data ? { data: this.redact(data) } : {}),
    };

    // MCP uses stdout for protocol; logs go to stderr
    process.stderr.write(JSON.stringify(entry) + "\n");
  }

  private redact(obj: Record<string, unknown>): Record<string, unknown> {
    if (this.redactKeys.size === 0) return obj;

    const result: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(obj)) {
      if (this.redactKeys.has(key)) {
        result[key] = "[REDACTED]";
      } else if (value !== null && typeof value === "object" && !Array.isArray(value)) {
        result[key] = this.redact(value as Record<string, unknown>);
      } else {
        result[key] = value;
      }
    }
    return result;
  }
}
