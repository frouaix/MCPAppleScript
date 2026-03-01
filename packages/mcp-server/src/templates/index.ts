/**
 * Template engine: builds AppleScript strings from template IDs and parameters.
 * Dispatches to per-app template modules based on the template ID prefix.
 */

export { esc, wrapScript, jsonEscHandlers } from "./escape.js";

import * as notes from "./notes.js";
import * as calendar from "./calendar.js";
import * as reminders from "./reminders.js";
import * as mail from "./mail.js";
import * as contacts from "./contacts.js";
import * as messages from "./messages.js";
import * as photos from "./photos.js";
import * as music from "./music.js";
import * as finder from "./finder.js";
import * as safari from "./safari.js";

const builders: Record<string, typeof notes> = {
  notes,
  calendar,
  reminders,
  mail,
  contacts,
  messages,
  photos,
  music,
  finder,
  safari,
};

/**
 * Build an AppleScript string from a template ID, bundle ID, and parameters.
 * Dispatches to the appropriate per-app template module by prefix.
 */
export function buildTemplateScript(
  templateId: string,
  bundleId: string,
  parameters: Record<string, unknown>
): string {
  const prefix = templateId.split(".")[0] ?? "";
  const builder = builders[prefix];
  if (!builder) {
    throw new Error(`Unknown template prefix: ${prefix} (template: ${templateId})`);
  }
  return builder.build(templateId, bundleId, parameters);
}
