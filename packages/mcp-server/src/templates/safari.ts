import { esc } from "./escape.js";

export function build(
  templateId: string,
  bundleId: string,
  parameters: Record<string, unknown>
): string {
  switch (templateId) {
    case "safari.list_windows":
      return buildListWindows(bundleId);
    case "safari.list_tabs":
      return buildListTabs(bundleId, parameters);
    case "safari.get_tab":
      return buildGetTab(bundleId, parameters);
    case "safari.search_tabs":
      return buildSearchTabs(bundleId, parameters);
    case "safari.open_url":
      return buildOpenUrl(bundleId, parameters);
    case "safari.close_tab":
      return buildCloseTab(bundleId, parameters);
    case "safari.show":
      return buildShow(bundleId);
    case "safari.do_javascript":
      return buildDoJavaScript(bundleId, parameters);
    case "safari.add_reading_list":
      return buildAddReadingList(bundleId, parameters);
    default:
      throw new Error(`Unknown safari template: ${templateId}`);
  }
}

function buildListWindows(bundleId: string): string {
  return `tell application id "${bundleId}"
    set windowList to {}
    repeat with w in windows
        set wId to id of w
        set wName to name of w
        set tabCount to count of tabs of w
        set end of windowList to {windowId:wId, windowName:wName, tabCount:tabCount}
    end repeat
    set output to "["
    repeat with i from 1 to count of windowList
        set w to item i of windowList
        set output to output & "{\\"id\\":" & (windowId of w) & ",\\"name\\":\\"" & my jsonEsc(windowName of w) & "\\",\\"type\\":\\"window\\",\\"itemCount\\":" & (tabCount of w as text) & "}"
        if i < (count of windowList) then set output to output & ","
    end repeat
    set output to output & "]"
    return output
end tell`;
}

function buildListTabs(bundleId: string, parameters: Record<string, unknown>): string {
  const windowId = (parameters["windowId"] as number | undefined) ?? 0;

  const targetClause = windowId > 0
    ? `tabs of window id ${windowId}`
    : "tabs of front window";

  return `tell application id "${bundleId}"
    set allTabs to ${targetClause}
    set totalCount to count of allTabs
    set output to "{\\"total\\":" & (totalCount as text) & ",\\"items\\":["
    repeat with i from 1 to totalCount
        set t to item i of allTabs
        set tName to name of t
        set tUrl to URL of t
        set output to output & "{\\"id\\":" & i & ",\\"name\\":\\"" & my jsonEsc(tName) & "\\",\\"type\\":\\"tab\\",\\"properties\\":{\\"url\\":\\"" & my jsonEsc(tUrl) & "\\"}}"
        if i < totalCount then set output to output & ","
    end repeat
    set output to output & "]}"
    return output
end tell`;
}

function buildGetTab(bundleId: string, parameters: Record<string, unknown>): string {
  const tabIndex = (parameters["tabIndex"] as number | undefined) ?? 1;
  const windowId = (parameters["windowId"] as number | undefined) ?? 0;

  const windowClause = windowId > 0 ? `window id ${windowId}` : "front window";

  return `tell application id "${bundleId}"
    set t to tab ${tabIndex} of ${windowClause}
    set tName to name of t
    set tUrl to URL of t
    set tSource to source of t
    return "{\\"id\\":${tabIndex},\\"name\\":\\"" & my jsonEsc(tName) & "\\",\\"type\\":\\"tab\\",\\"properties\\":{\\"url\\":\\"" & my jsonEsc(tUrl) & "\\",\\"source\\":\\"" & my jsonEsc(tSource) & "\\"}}"
end tell`;
}

function buildSearchTabs(bundleId: string, parameters: Record<string, unknown>): string {
  const query = parameters["query"] as string | undefined;
  if (!query) throw new Error("safari.search_tabs requires 'query' parameter");
  const limit = (parameters["limit"] as number | undefined) ?? 20;

  return `tell application id "${bundleId}"
    set matchingTabs to {}
    repeat with w in windows
        repeat with t in tabs of w
            if name of t contains "${esc(query)}" or URL of t contains "${esc(query)}" then
                set end of matchingTabs to {tName:name of t, tUrl:URL of t, tWindow:id of w}
            end if
            if (count of matchingTabs) ≥ ${limit} then exit repeat
        end repeat
        if (count of matchingTabs) ≥ ${limit} then exit repeat
    end repeat
    set output to "["
    repeat with i from 1 to count of matchingTabs
        set t to item i of matchingTabs
        set output to output & "{\\"id\\":" & i & ",\\"name\\":\\"" & my jsonEsc(tName of t) & "\\",\\"type\\":\\"tab\\",\\"properties\\":{\\"url\\":\\"" & my jsonEsc(tUrl of t) & "\\",\\"windowId\\":" & (tWindow of t) & "}}"
        if i < (count of matchingTabs) then set output to output & ","
    end repeat
    set output to output & "]"
    return output
end tell`;
}

function buildOpenUrl(bundleId: string, parameters: Record<string, unknown>): string {
  const url = parameters["url"] as string | undefined;
  if (!url) throw new Error("safari.open_url requires 'url' parameter");
  const newWindow = (parameters["newWindow"] as boolean | undefined) ?? false;

  if (newWindow) {
    return `tell application id "${bundleId}"
    make new document with properties {URL:"${esc(url)}"}
    return "{\\"opened\\":true,\\"url\\":\\"${esc(url)}\\",\\"newWindow\\":true}"
end tell`;
  }

  return `tell application id "${bundleId}"
    tell front window
        set newTab to make new tab with properties {URL:"${esc(url)}"}
    end tell
    return "{\\"opened\\":true,\\"url\\":\\"${esc(url)}\\"}"
end tell`;
}

function buildCloseTab(bundleId: string, parameters: Record<string, unknown>): string {
  const tabIndex = (parameters["tabIndex"] as number | undefined) ?? 1;
  const windowId = (parameters["windowId"] as number | undefined) ?? 0;

  const windowClause = windowId > 0 ? `window id ${windowId}` : "front window";

  return `tell application id "${bundleId}"
    set t to tab ${tabIndex} of ${windowClause}
    set tName to name of t
    close t
    return "{\\"closed\\":true,\\"name\\":\\"" & my jsonEsc(tName) & "\\"}"
end tell`;
}

function buildShow(bundleId: string): string {
  return `tell application id "${bundleId}"
    activate
    return "{\\"shown\\":true}"
end tell`;
}

function buildDoJavaScript(bundleId: string, parameters: Record<string, unknown>): string {
  const script = parameters["script"] as string | undefined;
  if (!script) throw new Error("safari.do_javascript requires 'script' parameter");
  const tabIndex = (parameters["tabIndex"] as number | undefined) ?? 1;
  const windowId = (parameters["windowId"] as number | undefined) ?? 0;

  const windowClause = windowId > 0 ? `window id ${windowId}` : "front window";

  return `tell application id "${bundleId}"
    set result to do JavaScript "${esc(script)}" in tab ${tabIndex} of ${windowClause}
    return "{\\"result\\":\\"" & my jsonEsc(result) & "\\"}"
end tell`;
}

function buildAddReadingList(bundleId: string, parameters: Record<string, unknown>): string {
  const url = parameters["url"] as string | undefined;
  if (!url) throw new Error("safari.add_reading_list requires 'url' parameter");
  const title = esc((parameters["title"] as string | undefined) ?? "");
  return `tell application id "${bundleId}"
    add reading list item "${esc(url)}" with title "${title}"
    return "{\\"added\\":true,\\"url\\":\\"${esc(url)}\\"}"
end tell`;
}
