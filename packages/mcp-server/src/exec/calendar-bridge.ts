import { execFile } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { isSea } from "node:sea";
import { ExecutorRequest, ExecutorResponse } from "./types.js";

const operations = new Set([
  "calendar.list_calendars",
  "calendar.list_events",
  "calendar.get_event",
  "calendar.search_events",
  "calendar.create_event",
  "calendar.update_event",
  "calendar.delete_event",
  "calendar.show",
]);

export function isCalendarOperation(request: ExecutorRequest): boolean {
  return (
    request.mode === "template" &&
    request.bundleId === "com.apple.iCal" &&
    request.templateId !== undefined &&
    operations.has(request.templateId)
  );
}

export async function runCalendarBridge(request: ExecutorRequest): Promise<ExecutorResponse> {
  const operation = request.templateId;
  if (!operation || !operations.has(operation)) {
    return {
      requestId: request.requestId,
      ok: false,
      error: { code: "INVALID_REQUEST", message: "Unsupported Calendar operation." },
    };
  }
  const parameters = { ...request.parameters, operation };
  if (request.dryRun) {
    return {
      requestId: request.requestId,
      ok: true,
      result: { backend: "EventKit", ...parameters },
      stdout: "",
      stderr: "",
    };
  }
  const appRoot = isSea()
    ? dirname(process.execPath)
    : fileURLToPath(new URL("../../dist", import.meta.url));
  const executable = join(appRoot, "CalendarBridge.app", "Contents", "MacOS", "CalendarBridge");

  return new Promise((resolve) => {
    const child = execFile(
      executable,
      [],
      {
        timeout: request.timeoutMs,
        maxBuffer: 10 * 1024 * 1024,
        killSignal: "SIGKILL",
      },
      (error, stdout, stderr) => {
        if (error) {
          const timedOut = error.killed || error.signal === "SIGKILL";
          resolve({
            requestId: request.requestId,
            ok: false,
            error: {
              code: timedOut ? "TIMEOUT" : "EXECUTOR_FAILED",
              message: timedOut
                ? `Calendar operation timed out after ${request.timeoutMs}ms`
                : stderr.trim() || `Could not run Calendar Bridge: ${error.message}`,
            },
          });
          return;
        }
        try {
          const result: unknown = JSON.parse(stdout);
          if (typeof result !== "object" || result === null)
            throw new Error("Expected an object or array");
          resolve({
            requestId: request.requestId,
            ok: true,
            result: result as Record<string, unknown>,
            stdout,
            stderr,
          });
        } catch {
          resolve({
            requestId: request.requestId,
            ok: false,
            error: { code: "EXECUTOR_FAILED", message: "Calendar Bridge returned invalid JSON." },
          });
        }
      }
    );
    child.stdin?.on("error", (error) => {
      if (!("code" in error && error.code === "EPIPE")) {
        child.kill();
        resolve({
          requestId: request.requestId,
          ok: false,
          error: {
            code: "EXECUTOR_FAILED",
            message: `Calendar Bridge input failed: ${error.message}`,
          },
        });
      }
    });
    child.stdin?.end(JSON.stringify(parameters));
  });
}
