import { spawn } from "node:child_process";
import { ExecutorRequest, ExecutorResponse } from "./types.js";
import { ExecutorError } from "../util/errors.js";
import { safeJsonParse } from "../util/json.js";
import { Logger } from "../util/logging.js";

export interface ExecutorOptions {
  executablePath: string;
  executableArgs?: string[];
  logger: Logger;
}

export async function runExecutor(
  request: ExecutorRequest,
  options: ExecutorOptions
): Promise<ExecutorResponse> {
  const { executablePath, executableArgs = [], logger } = options;
  const { timeoutMs } = request;

  logger.debug("Spawning executor", {
    requestId: request.requestId,
    executablePath,
    bundleId: request.bundleId,
    mode: request.mode,
    timeoutMs,
  });

  return new Promise<ExecutorResponse>((resolve, reject) => {
    const child = spawn(executablePath, executableArgs, {
      stdio: ["pipe", "pipe", "pipe"],
    });

    let stdout = "";
    let stderr = "";
    let timedOut = false;
    let settled = false;

    const timer = setTimeout(() => {
      timedOut = true;
      child.kill("SIGKILL");
    }, timeoutMs);

    const settle = (fn: () => void) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      fn();
    };

    child.stdout.on("data", (chunk: Buffer) => {
      stdout += chunk.toString();
    });

    child.stderr.on("data", (chunk: Buffer) => {
      stderr += chunk.toString();
    });

    child.on("error", (err) => {
      settle(() => {
        logger.error("Executor process error", {
          requestId: request.requestId,
          error: err.message,
        });
        reject(
          new ExecutorError("EXECUTOR_FAILED", `Failed to spawn executor: ${err.message}`, {
            requestId: request.requestId,
          })
        );
      });
    });

    child.on("close", (code) => {
      settle(() => {
        if (timedOut) {
          logger.warn("Executor timed out", {
            requestId: request.requestId,
            timeoutMs,
          });
          reject(
            new ExecutorError("TIMEOUT", `Executor timed out after ${timeoutMs}ms`, {
              requestId: request.requestId,
              timeoutMs,
            })
          );
          return;
        }

        if (stderr) {
          logger.debug("Executor stderr", { requestId: request.requestId, stderr });
        }

        const parsed = safeJsonParse(stdout);
        if (!parsed.ok) {
          logger.error("Failed to parse executor response", {
            requestId: request.requestId,
            exitCode: code,
            stdout,
            parseError: parsed.error,
          });
          reject(
            new ExecutorError(
              "EXECUTOR_FAILED",
              `Invalid JSON from executor (exit code ${code}): ${parsed.error}`,
              { requestId: request.requestId, exitCode: code }
            )
          );
          return;
        }

        const response = parsed.value as ExecutorResponse;
        logger.debug("Executor response", {
          requestId: request.requestId,
          ok: response.ok,
        });
        resolve(response);
      });
    });

    // Write request JSON to stdin and close.
    // Ignore EPIPE — the child may exit before reading all input.
    child.stdin.on("error", () => {});
    const requestJson = JSON.stringify(request);
    child.stdin.write(requestJson);
    child.stdin.end();
  });
}
