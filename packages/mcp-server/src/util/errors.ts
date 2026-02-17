export type ErrorCode =
  | "AUTOMATION_DENIED"
  | "APP_NOT_RUNNING"
  | "SCRIPT_ERROR"
  | "TIMEOUT"
  | "INVALID_REQUEST"
  | "EXECUTOR_FAILED"
  | "POLICY_DENIED"
  | "CONFIG_ERROR"
  | "UNKNOWN_ERROR";

export class McpAppleScriptError extends Error {
  readonly code: ErrorCode;
  readonly details?: Record<string, unknown>;

  constructor(code: ErrorCode, message: string, details?: Record<string, unknown>) {
    super(message);
    this.name = "McpAppleScriptError";
    this.code = code;
    this.details = details;
  }

  toJSON() {
    return {
      code: this.code,
      message: this.message,
      ...(this.details ? { details: this.details } : {}),
    };
  }
}

export class PolicyDeniedError extends McpAppleScriptError {
  constructor(message: string, details?: Record<string, unknown>) {
    super("POLICY_DENIED", message, details);
    this.name = "PolicyDeniedError";
  }
}

export class ExecutorError extends McpAppleScriptError {
  constructor(code: ErrorCode, message: string, details?: Record<string, unknown>) {
    super(code, message, details);
    this.name = "ExecutorError";
  }
}

export class ConfigError extends McpAppleScriptError {
  constructor(message: string, details?: Record<string, unknown>) {
    super("CONFIG_ERROR", message, details);
    this.name = "ConfigError";
  }
}
