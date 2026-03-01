import { esc } from "./escape.js";

export function build(
  templateId: string,
  bundleId: string,
  parameters: Record<string, unknown>
): string {
  switch (templateId) {
    case "music.list_playlists":
      return buildListPlaylists(bundleId);
    case "music.list_tracks":
      return buildListTracks(bundleId, parameters);
    case "music.get_track":
      return buildGetTrack(bundleId, parameters);
    case "music.search_tracks":
      return buildSearchTracks(bundleId, parameters);
    case "music.create_playlist":
      return buildCreatePlaylist(bundleId, parameters);
    case "music.show":
      return buildShow(bundleId);
    case "music.play":
      return buildPlay(bundleId, parameters);
    case "music.pause":
      return buildPause(bundleId);
    case "music.next":
      return buildNext(bundleId);
    case "music.previous":
      return buildPrevious(bundleId);
    case "music.now_playing":
      return buildNowPlaying(bundleId);
    default:
      throw new Error(`Unknown music template: ${templateId}`);
  }
}

function buildListPlaylists(bundleId: string): string {
  return `tell application id "${bundleId}"
    set playlistList to {}
    repeat with p in playlists
        set end of playlistList to {pId:id of p, pName:name of p, trackCount:(count of tracks of p)}
    end repeat
    set output to "["
    repeat with i from 1 to count of playlistList
        set p to item i of playlistList
        set output to output & "{\\"id\\":\\"" & my jsonEsc(pId of p) & "\\",\\"name\\":\\"" & my jsonEsc(pName of p) & "\\",\\"type\\":\\"playlist\\",\\"itemCount\\":" & (trackCount of p as text) & "}"
        if i < (count of playlistList) then set output to output & ","
    end repeat
    set output to output & "]"
    return output
end tell`;
}

function buildListTracks(bundleId: string, parameters: Record<string, unknown>): string {
  const playlistId = (parameters["playlistId"] as string | undefined) ?? "";
  const limit = (parameters["limit"] as number | undefined) ?? 50;
  const offset = (parameters["offset"] as number | undefined) ?? 0;

  const targetClause = playlistId
    ? `tracks of playlist id "${esc(playlistId)}"`
    : "tracks of library playlist 1";

  return `tell application id "${bundleId}"
    set allTracks to ${targetClause}
    set totalCount to count of allTracks
    set startIdx to ${offset + 1}
    set endIdx to ${offset + limit}
    if endIdx > totalCount then set endIdx to totalCount
    set output to "{\\"total\\":" & (totalCount as text) & ",\\"items\\":["
    if startIdx ≤ totalCount then
        repeat with i from startIdx to endIdx
            set t to item i of allTracks
            set tId to id of t
            set tName to name of t
            set tArtist to artist of t
            set tAlbum to album of t
            set tDuration to duration of t
            set output to output & "{\\"id\\":\\"" & my jsonEsc(tId) & "\\",\\"name\\":\\"" & my jsonEsc(tName) & "\\",\\"type\\":\\"track\\",\\"properties\\":{\\"artist\\":\\"" & my jsonEsc(tArtist) & "\\",\\"album\\":\\"" & my jsonEsc(tAlbum) & "\\",\\"duration\\":" & tDuration & "}}"
            if i < endIdx then set output to output & ","
        end repeat
    end if
    set output to output & "]}"
    return output
end tell`;
}

function buildGetTrack(bundleId: string, parameters: Record<string, unknown>): string {
  const trackId = parameters["trackId"] as string | undefined;
  if (!trackId) throw new Error("music.get_track requires 'trackId' parameter");
  return `tell application id "${bundleId}"
    set t to first track of library playlist 1 whose id is "${esc(trackId)}"
    set tId to id of t
    set tName to name of t
    set tArtist to artist of t
    set tAlbum to album of t
    set tDuration to duration of t
    set tGenre to genre of t
    set tYear to year of t
    set tRating to rating of t
    set tPlays to played count of t
    return "{\\"id\\":\\"" & my jsonEsc(tId) & "\\",\\"name\\":\\"" & my jsonEsc(tName) & "\\",\\"type\\":\\"track\\",\\"properties\\":{\\"artist\\":\\"" & my jsonEsc(tArtist) & "\\",\\"album\\":\\"" & my jsonEsc(tAlbum) & "\\",\\"duration\\":" & tDuration & ",\\"genre\\":\\"" & my jsonEsc(tGenre) & "\\",\\"year\\":" & tYear & ",\\"rating\\":" & tRating & ",\\"playCount\\":" & tPlays & "}}"
end tell`;
}

function buildSearchTracks(bundleId: string, parameters: Record<string, unknown>): string {
  const query = parameters["query"] as string | undefined;
  if (!query) throw new Error("music.search_tracks requires 'query' parameter");
  const limit = (parameters["limit"] as number | undefined) ?? 20;

  return `tell application id "${bundleId}"
    set matchingTracks to (search library playlist 1 for "${esc(query)}")
    set resultCount to count of matchingTracks
    if resultCount > ${limit} then set resultCount to ${limit}
    set output to "["
    repeat with i from 1 to resultCount
        set t to item i of matchingTracks
        set tId to id of t
        set tName to name of t
        set tArtist to artist of t
        set output to output & "{\\"id\\":\\"" & my jsonEsc(tId) & "\\",\\"name\\":\\"" & my jsonEsc(tName) & "\\",\\"type\\":\\"track\\",\\"properties\\":{\\"artist\\":\\"" & my jsonEsc(tArtist) & "\\"}}"
        if i < resultCount then set output to output & ","
    end repeat
    set output to output & "]"
    return output
end tell`;
}

function buildCreatePlaylist(bundleId: string, parameters: Record<string, unknown>): string {
  const name = parameters["name"] as string | undefined;
  if (!name) throw new Error("music.create_playlist requires 'name' parameter");
  const description = esc((parameters["description"] as string | undefined) ?? "");
  return `tell application id "${bundleId}"
    set newPlaylist to make new playlist with properties {name:"${esc(name)}", description:"${description}"}
    set pId to id of newPlaylist
    return "{\\"id\\":\\"" & my jsonEsc(pId) & "\\",\\"name\\":\\"${esc(name)}\\",\\"type\\":\\"playlist\\"}"
end tell`;
}

function buildPlay(bundleId: string, parameters: Record<string, unknown>): string {
  const trackId = (parameters["trackId"] as string | undefined) ?? "";
  if (trackId) {
    return `tell application id "${bundleId}"
    set t to first track of library playlist 1 whose id is "${esc(trackId)}"
    play t
    return "{\\"playing\\":true,\\"track\\":\\"" & my jsonEsc(name of t) & "\\"}"
end tell`;
  }
  return `tell application id "${bundleId}"
    play
    return "{\\"playing\\":true}"
end tell`;
}

function buildPause(bundleId: string): string {
  return `tell application id "${bundleId}"
    pause
    return "{\\"paused\\":true}"
end tell`;
}

function buildNext(bundleId: string): string {
  return `tell application id "${bundleId}"
    next track
    delay 0.5
    set t to current track
    return "{\\"track\\":\\"" & my jsonEsc(name of t) & "\\",\\"artist\\":\\"" & my jsonEsc(artist of t) & "\\"}"
end tell`;
}

function buildPrevious(bundleId: string): string {
  return `tell application id "${bundleId}"
    previous track
    delay 0.5
    set t to current track
    return "{\\"track\\":\\"" & my jsonEsc(name of t) & "\\",\\"artist\\":\\"" & my jsonEsc(artist of t) & "\\"}"
end tell`;
}

function buildNowPlaying(bundleId: string): string {
  return `tell application id "${bundleId}"
    if player state is playing then
        set t to current track
        set tName to name of t
        set tArtist to artist of t
        set tAlbum to album of t
        set tPos to player position
        set tDur to duration of t
        return "{\\"playing\\":true,\\"track\\":\\"" & my jsonEsc(tName) & "\\",\\"artist\\":\\"" & my jsonEsc(tArtist) & "\\",\\"album\\":\\"" & my jsonEsc(tAlbum) & "\\",\\"position\\":" & tPos & ",\\"duration\\":" & tDur & "}"
    else
        return "{\\"playing\\":false}"
    end if
end tell`;
}

function buildShow(bundleId: string): string {
  return `tell application id "${bundleId}"
    activate
    return "{\\"shown\\":true}"
end tell`;
}
