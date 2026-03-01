import { esc } from "./escape.js";

export function build(
  templateId: string,
  bundleId: string,
  parameters: Record<string, unknown>
): string {
  switch (templateId) {
    case "notes.list_folders":
      return buildListFolders(bundleId);
    case "notes.list_notes":
      return buildListNotes(bundleId, parameters);
    case "notes.get_note":
      return buildGetNote(bundleId, parameters);
    case "notes.search_notes":
      return buildSearchNotes(bundleId, parameters);
    case "notes.create_note":
      return buildCreateNote(bundleId, parameters);
    case "notes.update_note":
      return buildUpdateNote(bundleId, parameters);
    case "notes.delete_note":
      return buildDeleteNote(bundleId, parameters);
    case "notes.show":
      return buildShow(bundleId, parameters);
    default:
      throw new Error(`Unknown notes template: ${templateId}`);
  }
}

function buildListFolders(bundleId: string): string {
  return `tell application id "${bundleId}"
    set folderList to {}
    repeat with f in folders
        set end of folderList to {id:id of f, name:name of f, itemCount:(count of notes of f)}
    end repeat
    set output to "["
    repeat with i from 1 to count of folderList
        set f to item i of folderList
        set output to output & "{\\"id\\":\\"" & my jsonEsc(id of f) & "\\",\\"name\\":\\"" & my jsonEsc(name of f) & "\\",\\"type\\":\\"folder\\",\\"itemCount\\":" & (itemCount of f as text) & "}"
        if i < (count of folderList) then set output to output & ","
    end repeat
    set output to output & "]"
    return output
end tell`;
}

function buildListNotes(bundleId: string, parameters: Record<string, unknown>): string {
  const folderId = (parameters["folderId"] as string | undefined) ?? "";
  const limit = (parameters["limit"] as number | undefined) ?? 50;
  const offset = (parameters["offset"] as number | undefined) ?? 0;

  const targetClause = folderId
    ? `notes of folder id "${esc(folderId)}"`
    : "notes";

  return `tell application id "${bundleId}"
    set allNotes to ${targetClause}
    set totalCount to count of allNotes
    set startIdx to ${offset + 1}
    set endIdx to ${offset + limit}
    if endIdx > totalCount then set endIdx to totalCount
    set output to "{\\"total\\":" & (totalCount as text) & ",\\"items\\":["
    if startIdx ≤ totalCount then
        repeat with i from startIdx to endIdx
            set n to item i of allNotes
            set nId to id of n
            set nName to name of n
            set nDate to modification date of n as «class isot» as string
            set output to output & "{\\"id\\":\\"" & my jsonEsc(nId) & "\\",\\"name\\":\\"" & my jsonEsc(nName) & "\\",\\"type\\":\\"note\\",\\"modifiedAt\\":\\"" & my jsonEsc(nDate) & "\\"}"
            if i < endIdx then set output to output & ","
        end repeat
    end if
    set output to output & "]}"
    return output
end tell`;
}

function buildGetNote(bundleId: string, parameters: Record<string, unknown>): string {
  const noteId = parameters["noteId"] as string | undefined;
  if (!noteId) throw new Error("notes.get_note requires 'noteId' parameter");
  return `tell application id "${bundleId}"
    set n to note id "${esc(noteId)}"
    set nId to id of n
    set nName to name of n
    set nBody to plaintext of n
    set nCreated to creation date of n as «class isot» as string
    set nModified to modification date of n as «class isot» as string
    set cName to name of container of n
    return "{\\"id\\":\\"" & my jsonEsc(nId) & "\\",\\"name\\":\\"" & my jsonEsc(nName) & "\\",\\"type\\":\\"note\\",\\"containerName\\":\\"" & my jsonEsc(cName) & "\\",\\"createdAt\\":\\"" & my jsonEsc(nCreated) & "\\",\\"modifiedAt\\":\\"" & my jsonEsc(nModified) & "\\",\\"properties\\":{\\"body\\":\\"" & my jsonEsc(nBody) & "\\"}}"
end tell`;
}

function buildSearchNotes(bundleId: string, parameters: Record<string, unknown>): string {
  const query = parameters["query"] as string | undefined;
  if (!query) throw new Error("notes.search_notes requires 'query' parameter");
  const limit = (parameters["limit"] as number | undefined) ?? 20;

  return `tell application id "${bundleId}"
    set matchingNotes to notes whose name contains "${esc(query)}"
    set resultCount to count of matchingNotes
    if resultCount > ${limit} then set resultCount to ${limit}
    set output to "["
    repeat with i from 1 to resultCount
        set n to item i of matchingNotes
        set nId to id of n
        set nName to name of n
        set nDate to modification date of n as «class isot» as string
        set output to output & "{\\"id\\":\\"" & my jsonEsc(nId) & "\\",\\"name\\":\\"" & my jsonEsc(nName) & "\\",\\"type\\":\\"note\\",\\"modifiedAt\\":\\"" & my jsonEsc(nDate) & "\\"}"
        if i < resultCount then set output to output & ","
    end repeat
    set output to output & "]"
    return output
end tell`;
}

function buildCreateNote(bundleId: string, parameters: Record<string, unknown>): string {
  const title = esc((parameters["title"] as string | undefined) ?? "Untitled");
  const body = esc((parameters["body"] as string | undefined) ?? "");
  const folderId = (parameters["folderId"] as string | undefined) ?? "";

  const targetClause = folderId ? `in folder id "${esc(folderId)}"` : "";

  return `tell application id "${bundleId}"
    set newNote to make new note ${targetClause} with properties {name:"${title}", body:"${body}"}
    set nId to id of newNote
    set nName to name of newNote
    return "{\\"id\\":\\"" & my jsonEsc(nId) & "\\",\\"name\\":\\"" & my jsonEsc(nName) & "\\",\\"type\\":\\"note\\"}"
end tell`;
}

function buildUpdateNote(bundleId: string, parameters: Record<string, unknown>): string {
  const noteId = parameters["noteId"] as string | undefined;
  if (!noteId) throw new Error("notes.update_note requires 'noteId' parameter");
  const setStatements: string[] = [];
  if (parameters["name"] !== undefined) {
    setStatements.push(`set name of n to "${esc(parameters["name"] as string)}"`);
  }
  if (parameters["body"] !== undefined) {
    setStatements.push(`set body of n to "${esc(parameters["body"] as string)}"`);
  }
  if (setStatements.length === 0) {
    throw new Error("notes.update_note requires at least one property to update");
  }
  return `tell application id "${bundleId}"
    set n to note id "${esc(noteId)}"
    ${setStatements.join("\n    ")}
    return "{\\"id\\":\\"" & my jsonEsc(id of n) & "\\",\\"name\\":\\"" & my jsonEsc(name of n) & "\\",\\"type\\":\\"note\\"}"
end tell`;
}

function buildDeleteNote(bundleId: string, parameters: Record<string, unknown>): string {
  const noteId = parameters["noteId"] as string | undefined;
  if (!noteId) throw new Error("notes.delete_note requires 'noteId' parameter");
  return `tell application id "${bundleId}"
    set n to note id "${esc(noteId)}"
    set nName to name of n
    delete n
    return "{\\"deleted\\":true,\\"name\\":\\"" & my jsonEsc(nName) & "\\"}"
end tell`;
}

function buildShow(bundleId: string, parameters: Record<string, unknown>): string {
  const noteId = (parameters["noteId"] as string | undefined) ?? "";
  if (!noteId) {
    return `tell application id "${bundleId}"
    activate
    return "{\\"shown\\":true}"
end tell`;
  }
  return `tell application id "${bundleId}"
    activate
    show note id "${esc(noteId)}"
    return "{\\"shown\\":true}"
end tell`;
}
