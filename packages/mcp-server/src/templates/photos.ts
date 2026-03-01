import { esc } from "./escape.js";

export function build(
  templateId: string,
  bundleId: string,
  parameters: Record<string, unknown>
): string {
  switch (templateId) {
    case "photos.list_albums":
      return buildListAlbums(bundleId);
    case "photos.list_items":
      return buildListItems(bundleId, parameters);
    case "photos.get_item":
      return buildGetItem(bundleId, parameters);
    case "photos.search_items":
      return buildSearchItems(bundleId, parameters);
    case "photos.create_album":
      return buildCreateAlbum(bundleId, parameters);
    case "photos.import":
      return buildImport(bundleId, parameters);
    case "photos.show":
      return buildShow(bundleId);
    default:
      throw new Error(`Unknown photos template: ${templateId}`);
  }
}

function buildListAlbums(bundleId: string): string {
  return `tell application id "${bundleId}"
    set albumList to {}
    repeat with a in albums
        set end of albumList to {albumId:id of a, albumName:name of a, mediaCount:(count of media items of a)}
    end repeat
    set output to "["
    repeat with i from 1 to count of albumList
        set a to item i of albumList
        set output to output & "{\\"id\\":\\"" & my jsonEsc(albumId of a) & "\\",\\"name\\":\\"" & my jsonEsc(albumName of a) & "\\",\\"type\\":\\"album\\",\\"itemCount\\":" & (mediaCount of a as text) & "}"
        if i < (count of albumList) then set output to output & ","
    end repeat
    set output to output & "]"
    return output
end tell`;
}

function buildListItems(bundleId: string, parameters: Record<string, unknown>): string {
  const albumId = (parameters["albumId"] as string | undefined) ?? "";
  const limit = (parameters["limit"] as number | undefined) ?? 50;
  const offset = (parameters["offset"] as number | undefined) ?? 0;

  const targetClause = albumId
    ? `media items of album id "${esc(albumId)}"`
    : "media items";

  return `tell application id "${bundleId}"
    set allItems to ${targetClause}
    set totalCount to count of allItems
    set startIdx to ${offset + 1}
    set endIdx to ${offset + limit}
    if endIdx > totalCount then set endIdx to totalCount
    set output to "{\\"total\\":" & (totalCount as text) & ",\\"items\\":["
    if startIdx ≤ totalCount then
        repeat with i from startIdx to endIdx
            set m to item i of allItems
            set mId to id of m
            set mName to filename of m
            set mDate to date of m as «class isot» as string
            set mWidth to width of m
            set mHeight to height of m
            set output to output & "{\\"id\\":\\"" & my jsonEsc(mId) & "\\",\\"name\\":\\"" & my jsonEsc(mName) & "\\",\\"type\\":\\"media\\",\\"properties\\":{\\"date\\":\\"" & my jsonEsc(mDate) & "\\",\\"width\\":" & mWidth & ",\\"height\\":" & mHeight & "}}"
            if i < endIdx then set output to output & ","
        end repeat
    end if
    set output to output & "]}"
    return output
end tell`;
}

function buildGetItem(bundleId: string, parameters: Record<string, unknown>): string {
  const itemId = parameters["itemId"] as string | undefined;
  if (!itemId) throw new Error("photos.get_item requires 'itemId' parameter");
  return `tell application id "${bundleId}"
    set m to media item id "${esc(itemId)}"
    set mId to id of m
    set mName to filename of m
    set mDate to date of m as «class isot» as string
    set mWidth to width of m
    set mHeight to height of m
    set mFav to favorite of m
    set mDesc to description of m
    set mLoc to location of m
    return "{\\"id\\":\\"" & my jsonEsc(mId) & "\\",\\"name\\":\\"" & my jsonEsc(mName) & "\\",\\"type\\":\\"media\\",\\"properties\\":{\\"date\\":\\"" & my jsonEsc(mDate) & "\\",\\"width\\":" & mWidth & ",\\"height\\":" & mHeight & ",\\"favorite\\":" & mFav & ",\\"description\\":\\"" & my jsonEsc(mDesc) & "\\"}}"
end tell`;
}

function buildSearchItems(bundleId: string, parameters: Record<string, unknown>): string {
  const query = parameters["query"] as string | undefined;
  if (!query) throw new Error("photos.search_items requires 'query' parameter");
  const limit = (parameters["limit"] as number | undefined) ?? 20;

  return `tell application id "${bundleId}"
    set matchingItems to media items whose description contains "${esc(query)}"
    set resultCount to count of matchingItems
    if resultCount > ${limit} then set resultCount to ${limit}
    set output to "["
    repeat with i from 1 to resultCount
        set m to item i of matchingItems
        set mId to id of m
        set mName to filename of m
        set mDate to date of m as «class isot» as string
        set output to output & "{\\"id\\":\\"" & my jsonEsc(mId) & "\\",\\"name\\":\\"" & my jsonEsc(mName) & "\\",\\"type\\":\\"media\\",\\"properties\\":{\\"date\\":\\"" & my jsonEsc(mDate) & "\\"}}"
        if i < resultCount then set output to output & ","
    end repeat
    set output to output & "]"
    return output
end tell`;
}

function buildCreateAlbum(bundleId: string, parameters: Record<string, unknown>): string {
  const name = parameters["name"] as string | undefined;
  if (!name) throw new Error("photos.create_album requires 'name' parameter");
  return `tell application id "${bundleId}"
    set newAlbum to make new album named "${esc(name)}"
    set aId to id of newAlbum
    return "{\\"id\\":\\"" & my jsonEsc(aId) & "\\",\\"name\\":\\"${esc(name)}\\",\\"type\\":\\"album\\"}"
end tell`;
}

function buildImport(bundleId: string, parameters: Record<string, unknown>): string {
  const filePath = parameters["filePath"] as string | undefined;
  if (!filePath) throw new Error("photos.import requires 'filePath' parameter");
  const albumId = (parameters["albumId"] as string | undefined) ?? "";
  const targetClause = albumId ? ` into album id "${esc(albumId)}"` : "";
  return `tell application id "${bundleId}"
    import POSIX file "${esc(filePath)}"${targetClause}
    return "{\\"imported\\":true,\\"filePath\\":\\"${esc(filePath)}\\"}"
end tell`;
}

function buildShow(bundleId: string): string {
  return `tell application id "${bundleId}"
    activate
    return "{\\"shown\\":true}"
end tell`;
}
