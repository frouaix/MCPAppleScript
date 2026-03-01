import { esc } from "./escape.js";

export function build(
  templateId: string,
  bundleId: string,
  parameters: Record<string, unknown>
): string {
  switch (templateId) {
    case "finder.list_folders":
      return buildListFolders(bundleId, parameters);
    case "finder.list_items":
      return buildListItems(bundleId, parameters);
    case "finder.get_item":
      return buildGetItem(bundleId, parameters);
    case "finder.search_items":
      return buildSearchItems(bundleId, parameters);
    case "finder.create_folder":
      return buildCreateFolder(bundleId, parameters);
    case "finder.move_item":
      return buildMoveItem(bundleId, parameters);
    case "finder.duplicate_item":
      return buildDuplicateItem(bundleId, parameters);
    case "finder.delete_item":
      return buildDeleteItem(bundleId, parameters);
    case "finder.show":
      return buildShow(bundleId, parameters);
    case "finder.reveal":
      return buildReveal(bundleId, parameters);
    default:
      throw new Error(`Unknown finder template: ${templateId}`);
  }
}

function buildListFolders(bundleId: string, parameters: Record<string, unknown>): string {
  const path = (parameters["path"] as string | undefined) ?? "~";
  return `tell application id "${bundleId}"
    set targetFolder to POSIX file "${esc(path)}" as alias
    set folderList to {}
    repeat with f in folders of folder targetFolder
        set end of folderList to {fName:name of f, fPath:POSIX path of (f as alias)}
    end repeat
    set output to "["
    repeat with i from 1 to count of folderList
        set f to item i of folderList
        set output to output & "{\\"id\\":\\"" & my jsonEsc(fPath of f) & "\\",\\"name\\":\\"" & my jsonEsc(fName of f) & "\\",\\"type\\":\\"folder\\"}"
        if i < (count of folderList) then set output to output & ","
    end repeat
    set output to output & "]"
    return output
end tell`;
}

function buildListItems(bundleId: string, parameters: Record<string, unknown>): string {
  const path = (parameters["path"] as string | undefined) ?? "~";
  const limit = (parameters["limit"] as number | undefined) ?? 50;
  const offset = (parameters["offset"] as number | undefined) ?? 0;

  return `tell application id "${bundleId}"
    set targetFolder to POSIX file "${esc(path)}" as alias
    set allItems to items of folder targetFolder
    set totalCount to count of allItems
    set startIdx to ${offset + 1}
    set endIdx to ${offset + limit}
    if endIdx > totalCount then set endIdx to totalCount
    set output to "{\\"total\\":" & (totalCount as text) & ",\\"items\\":["
    if startIdx ≤ totalCount then
        repeat with i from startIdx to endIdx
            set f to item i of allItems
            set fName to name of f
            set fPath to POSIX path of (f as alias)
            set fKind to kind of f
            set fSize to size of f
            set fDate to modification date of f as «class isot» as string
            set output to output & "{\\"id\\":\\"" & my jsonEsc(fPath) & "\\",\\"name\\":\\"" & my jsonEsc(fName) & "\\",\\"type\\":\\"file\\",\\"modifiedAt\\":\\"" & my jsonEsc(fDate) & "\\",\\"properties\\":{\\"kind\\":\\"" & my jsonEsc(fKind) & "\\",\\"size\\":" & fSize & "}}"
            if i < endIdx then set output to output & ","
        end repeat
    end if
    set output to output & "]}"
    return output
end tell`;
}

function buildGetItem(bundleId: string, parameters: Record<string, unknown>): string {
  const path = parameters["path"] as string | undefined;
  if (!path) throw new Error("finder.get_item requires 'path' parameter");
  return `tell application id "${bundleId}"
    set f to POSIX file "${esc(path)}" as alias
    set fi to info for f
    set fName to name of fi
    set fKind to kind of fi
    set fSize to size of fi
    set fCreated to creation date of fi as «class isot» as string
    set fModified to modification date of fi as «class isot» as string
    return "{\\"id\\":\\"" & my jsonEsc(POSIX path of f) & "\\",\\"name\\":\\"" & my jsonEsc(fName) & "\\",\\"type\\":\\"file\\",\\"createdAt\\":\\"" & my jsonEsc(fCreated) & "\\",\\"modifiedAt\\":\\"" & my jsonEsc(fModified) & "\\",\\"properties\\":{\\"kind\\":\\"" & my jsonEsc(fKind) & "\\",\\"size\\":" & fSize & "}}"
end tell`;
}

function buildSearchItems(bundleId: string, parameters: Record<string, unknown>): string {
  const query = parameters["query"] as string | undefined;
  if (!query) throw new Error("finder.search_items requires 'query' parameter");
  const path = (parameters["path"] as string | undefined) ?? "~";
  const limit = (parameters["limit"] as number | undefined) ?? 20;

  return `tell application id "${bundleId}"
    set targetFolder to POSIX file "${esc(path)}" as alias
    set matchingItems to (every item of folder targetFolder whose name contains "${esc(query)}")
    set resultCount to count of matchingItems
    if resultCount > ${limit} then set resultCount to ${limit}
    set output to "["
    repeat with i from 1 to resultCount
        set f to item i of matchingItems
        set fName to name of f
        set fPath to POSIX path of (f as alias)
        set output to output & "{\\"id\\":\\"" & my jsonEsc(fPath) & "\\",\\"name\\":\\"" & my jsonEsc(fName) & "\\",\\"type\\":\\"file\\"}"
        if i < resultCount then set output to output & ","
    end repeat
    set output to output & "]"
    return output
end tell`;
}

function buildCreateFolder(bundleId: string, parameters: Record<string, unknown>): string {
  const name = parameters["name"] as string | undefined;
  if (!name) throw new Error("finder.create_folder requires 'name' parameter");
  const parentPath = (parameters["parentPath"] as string | undefined) ?? "~";
  return `tell application id "${bundleId}"
    set parentFolder to POSIX file "${esc(parentPath)}" as alias
    set newFolder to make new folder at folder parentFolder with properties {name:"${esc(name)}"}
    set fPath to POSIX path of (newFolder as alias)
    return "{\\"id\\":\\"" & my jsonEsc(fPath) & "\\",\\"name\\":\\"${esc(name)}\\",\\"type\\":\\"folder\\"}"
end tell`;
}

function buildMoveItem(bundleId: string, parameters: Record<string, unknown>): string {
  const sourcePath = parameters["sourcePath"] as string | undefined;
  if (!sourcePath) throw new Error("finder.move_item requires 'sourcePath' parameter");
  const destPath = parameters["destPath"] as string | undefined;
  if (!destPath) throw new Error("finder.move_item requires 'destPath' parameter");
  return `tell application id "${bundleId}"
    set sourceItem to POSIX file "${esc(sourcePath)}" as alias
    set destFolder to POSIX file "${esc(destPath)}" as alias
    move sourceItem to folder destFolder
    return "{\\"moved\\":true,\\"from\\":\\"${esc(sourcePath)}\\",\\"to\\":\\"${esc(destPath)}\\"}"
end tell`;
}

function buildDuplicateItem(bundleId: string, parameters: Record<string, unknown>): string {
  const sourcePath = parameters["sourcePath"] as string | undefined;
  if (!sourcePath) throw new Error("finder.duplicate_item requires 'sourcePath' parameter");
  const destPath = (parameters["destPath"] as string | undefined) ?? "";
  const destClause = destPath
    ? ` to folder (POSIX file "${esc(destPath)}" as alias)`
    : "";
  return `tell application id "${bundleId}"
    set sourceItem to POSIX file "${esc(sourcePath)}" as alias
    set dupItem to duplicate sourceItem${destClause}
    set dupPath to POSIX path of (dupItem as alias)
    return "{\\"duplicated\\":true,\\"path\\":\\"" & my jsonEsc(dupPath) & "\\"}"
end tell`;
}

function buildDeleteItem(bundleId: string, parameters: Record<string, unknown>): string {
  const path = parameters["path"] as string | undefined;
  if (!path) throw new Error("finder.delete_item requires 'path' parameter");
  return `tell application id "${bundleId}"
    set targetItem to POSIX file "${esc(path)}" as alias
    set itemName to name of targetItem
    delete targetItem
    return "{\\"deleted\\":true,\\"name\\":\\"" & my jsonEsc(itemName) & "\\"}"
end tell`;
}

function buildShow(bundleId: string, parameters: Record<string, unknown>): string {
  const path = (parameters["path"] as string | undefined) ?? "";
  if (!path) {
    return `tell application id "${bundleId}"
    activate
    return "{\\"shown\\":true}"
end tell`;
  }
  return `tell application id "${bundleId}"
    activate
    set targetFolder to POSIX file "${esc(path)}" as alias
    open folder targetFolder
    return "{\\"shown\\":true}"
end tell`;
}

function buildReveal(bundleId: string, parameters: Record<string, unknown>): string {
  const path = parameters["path"] as string | undefined;
  if (!path) throw new Error("finder.reveal requires 'path' parameter");
  return `tell application id "${bundleId}"
    activate
    reveal POSIX file "${esc(path)}" as alias
    return "{\\"revealed\\":true}"
end tell`;
}
