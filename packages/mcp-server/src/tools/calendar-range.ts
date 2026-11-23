import { z } from "zod";
import { McpAppleScriptError } from "../util/errors.js";

export const timestamp = z
  .string()
  .datetime({ offset: true, precision: 0 })
  .describe("ISO 8601 timestamp with seconds and Z or an explicit UTC offset");

export function resolveEventRange(
  input: { day?: "today" | "tomorrow"; startDate?: string; endDate?: string },
  now = new Date()
): { startDate: string; endDate: string; timeZone: string } {
  let start: Date;
  let end: Date;
  if (input.day && input.startDate === undefined && input.endDate === undefined) {
    start = new Date(now);
    start.setHours(0, 0, 0, 0);
    if (input.day === "tomorrow") start.setDate(start.getDate() + 1);
    end = new Date(start);
    end.setDate(end.getDate() + 1);
  } else if (!input.day && input.startDate && input.endDate) {
    start = new Date(input.startDate);
    end = new Date(input.endDate);
  } else {
    throw new McpAppleScriptError(
      "INVALID_REQUEST",
      'Provide day ("today" or "tomorrow"), or both startDate and endDate, not both.'
    );
  }
  if (!Number.isFinite(start.getTime()) || !Number.isFinite(end.getTime()) || end <= start) {
    throw new McpAppleScriptError("INVALID_REQUEST", "endDate must be later than startDate.");
  }
  if (end.getTime() - start.getTime() > 3 * 366 * 24 * 60 * 60 * 1000) {
    throw new McpAppleScriptError(
      "INVALID_REQUEST",
      "Calendar date ranges cannot exceed three years."
    );
  }
  return {
    startDate: start.toISOString().replace(".000Z", "Z"),
    endDate: end.toISOString().replace(".000Z", "Z"),
    timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
  };
}
