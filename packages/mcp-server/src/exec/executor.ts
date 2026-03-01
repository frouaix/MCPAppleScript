import { execFile } from "node:child_process";
import { ExecutorRequest, ExecutorResponse } from "./types.js";
import { ExecutorError } from "../util/errors.js";
import { safeJsonParse } from "../util/json.js";
import { Logger } from "../util/logging.js";
import { buildTemplateScript, wrapScript } from "../templates/index.js";

export interface ExecutorOptions {
  logger: Logger;
}

/**
 * Execute an AppleScript via osascript.
 *
 * For template mode: builds the script from TypeScript templates, wraps with JSON
 * helpers, then executes. For raw mode: executes the script string directly.
 * If dryRun is set, returns the generated script without executing.
 */
export async function runExecutor(
  request: ExecutorRequest,
  options: ExecutorOptions
): Promise<ExecutorResponse> {
  const { logger } = options;
  const { timeoutMs } = request;

  // Build the AppleScript source
  let script: string;
  if (request.mode === "template") {
    if (!request.templateId) {
      throw new ExecutorError("INVALID_REQUEST", "templateId is required for template mode", {
        requestId: request.requestId,
      });
    }
    script = wrapScript(
      buildTemplateScript(request.templateId, request.bundleId, request.parameters)
    );
  } else {
    if (!request.script) {
      throw new ExecutorError("INVALID_REQUEST", "script is required for raw mode", {
        requestId: request.requestId,
      });
    }
    script = request.script;
  }

  // Dry run — return the script without executing
  if (request.dryRun) {
    logger.debug("Dry run — returning script", { requestId: request.requestId });
    return {
      requestId: request.requestId,
      ok: true,
      result: { script },
      stdout: "",
      stderr: "",
    };
  }

  logger.debug("Executing via osascript", {
    requestId: request.requestId,
    bundleId: request.bundleId,
    mode: request.mode,
    timeoutMs,
  });

  return new Promise<ExecutorResponse>((resolve) => {
    const child = execFile(
      "osascript",
      ["-e", script],
      {
        timeout: timeoutMs,
        maxBuffer: 10 * 1024 * 1024,
        killSignal: "SIGKILL",
      },
      (error, stdout, stderr) => {
        if (stderr) {
          logger.debug("osascript stderr", { requestId: request.requestId, stderr });
        }

        if (error) {
          // Timeout (killed by signal)
          if (error.killed || error.signal === "SIGKILL") {
            logger.warn("osascript timed out", { requestId: request.requestId, timeoutMs });
            resolve({
              requestId: request.requestId,
              ok: false,
              error: {
                code: "TIMEOUT",
                message: `Script timed out after ${timeoutMs}ms`,
              },
            });
            return;
          }

          const errMsg = stderr || error.message;
          const code = classifyOsascriptError(errMsg);
          logger.debug("osascript error", {
            requestId: request.requestId,
            code,
            message: errMsg,
          });
          resolve({
            requestId: request.requestId,
            ok: false,
            error: { code, message: errMsg },
          });
          return;
        }

        // osascript succeeded — parse JSON output
        const trimmed = stdout.trim();
        const parsed = safeJsonParse(trimmed);
        if (!parsed.ok) {
          // Script returned non-JSON — return as raw text
          resolve({
            requestId: request.requestId,
            ok: true,
            result: { text: trimmed },
            stdout: trimmed,
            stderr,
          });
          return;
        }

        resolve({
          requestId: request.requestId,
          ok: true,
          result: parsed.value as Record<string, unknown>,
          stdout: trimmed,
          stderr,
        });
      }
    );

    // Handle spawn errors (e.g. osascript not found)
    child.on("error", (err) => {
      logger.error("Failed to spawn osascript", {
        requestId: request.requestId,
        error: err.message,
      });
      resolve({
        requestId: request.requestId,
        ok: false,
        error: { code: "EXECUTOR_FAILED", message: `Failed to spawn osascript: ${err.message}` },
      });
    });
  });
}

/** Classify an osascript error message into an error code. */
function classifyOsascriptError(message: string): string {
  if (message.includes("-1743")) return "AUTOMATION_DENIED";
  if (message.includes("-600") || message.includes("-10810")) return "APP_NOT_RUNNING";
  return "SCRIPT_ERROR";
}
