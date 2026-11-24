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
  "reminders.list_lists",
  "reminders.list_reminders",
  "reminders.list_due",
  "reminders.get_reminder",
  "reminders.search_reminders",
  "reminders.create_reminder",
  "reminders.update_reminder",
  "reminders.delete_reminder",
  "reminders.complete",
  "reminders.show",
  "contacts.list_groups",
  "contacts.list_people",
  "contacts.get_person",
  "contacts.search_people",
  "contacts.create_person",
  "contacts.update_person",
  "contacts.delete_person",
  "contacts.show",
  "photos.list_albums",
  "photos.list_items",
  "photos.get_item",
  "photos.search_items",
  "photos.create_album",
  "photos.import",
  "photos.show",
]);

export function isNativeOperation(request: ExecutorRequest): boolean {
  return (
    request.mode === "template" &&
    request.templateId !== undefined &&
    operations.has(request.templateId) &&
    ((request.bundleId === "com.apple.iCal" && request.templateId.startsWith("calendar.")) ||
      (request.bundleId === "com.apple.reminders" && request.templateId.startsWith("reminders.")) ||
      (request.bundleId === "com.apple.Contacts" && request.templateId.startsWith("contacts.")) ||
      (request.bundleId === "com.apple.Photos" && request.templateId.startsWith("photos.")))
  );
}

export async function runMCPBridge(request: ExecutorRequest): Promise<ExecutorResponse> {
  const operation = request.templateId;
  if (!operation || !operations.has(operation)) {
    return {
      requestId: request.requestId,
      ok: false,
      error: { code: "INVALID_REQUEST", message: "Unsupported native operation." },
    };
  }
  const parameters = { ...request.parameters, operation };
  if (request.dryRun) {
    return {
      requestId: request.requestId,
      ok: true,
      result: {
        backend: operation.startsWith("contacts.")
          ? "Contacts"
          : operation.startsWith("photos.")
            ? "PhotoKit"
            : "EventKit",
        ...parameters,
      },
      stdout: "",
      stderr: "",
    };
  }
  const appRoot = isSea()
    ? dirname(process.execPath)
    : fileURLToPath(new URL("../../dist", import.meta.url));
  const executable = join(appRoot, "MCPBridge.app", "Contents", "MacOS", "MCPBridge");

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
                ? `Native operation timed out after ${request.timeoutMs}ms`
                : stderr.trim() || `Could not run MCPBridge: ${error.message}`,
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
            error: { code: "EXECUTOR_FAILED", message: "MCPBridge returned invalid JSON." },
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
            message: `MCPBridge input failed: ${error.message}`,
          },
        });
      }
    });
    child.stdin?.end(JSON.stringify(parameters));
  });
}
