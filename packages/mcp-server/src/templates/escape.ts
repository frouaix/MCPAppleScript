/**
 * Shared AppleScript escaping utilities for template builders.
 *
 * Two layers of escaping:
 * - `esc()` — compile-time: escapes user parameters for safe embedding in AppleScript string literals
 * - `jsonEscHandlers` — runtime: AppleScript handlers that escape values for safe JSON embedding
 */

/** Escape a string for embedding in an AppleScript string literal. */
export function esc(s: string): string {
  return s.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
}

/**
 * AppleScript handlers that escape string values for safe JSON embedding.
 * Appended to every template script by wrapScript().
 *
 * `jsonEsc(s)` escapes: \ → \\, " → \", CR → \n, LF → \n, tab → \t
 * `replaceText(theString, old, new)` helper for text item delimiter-based replacement.
 */
export const jsonEscHandlers = `

on jsonEsc(s)
    set s to s as text
    set s to my replaceText(s, "\\\\", "\\\\\\\\")
    set s to my replaceText(s, "\\"", "\\\\" & quote)
    set s to my replaceText(s, return, "\\\\n")
    set s to my replaceText(s, linefeed, "\\\\n")
    set s to my replaceText(s, tab, "\\\\t")
    return s
end jsonEsc

on replaceText(theString, old, new)
    set AppleScript's text item delimiters to old
    set theItems to every text item of theString
    set AppleScript's text item delimiters to new
    set theString to theItems as string
    set AppleScript's text item delimiters to ""
    return theString
end replaceText`;

/** Appends the jsonEsc handlers to a template script. */
export function wrapScript(script: string): string {
  return script + jsonEscHandlers;
}
