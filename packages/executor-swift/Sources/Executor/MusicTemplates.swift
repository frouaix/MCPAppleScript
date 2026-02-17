import Foundation

/// AppleScript templates for Apple Music.
/// Music supports: list playlists, list tracks, get track, search, play, pause, next/prev, create playlist.
enum MusicTemplates {
    static func build(templateId: String, bundleId: String, parameters: [String: Any]) throws -> String {
        switch templateId {
        case "music.list_playlists":
            return buildListPlaylists(bundleId: bundleId)
        case "music.list_tracks":
            return buildListTracks(bundleId: bundleId, parameters: parameters)
        case "music.get_track":
            return try buildGetTrack(bundleId: bundleId, parameters: parameters)
        case "music.search_tracks":
            return try buildSearchTracks(bundleId: bundleId, parameters: parameters)
        case "music.create_playlist":
            return try buildCreatePlaylist(bundleId: bundleId, parameters: parameters)
        case "music.show":
            return buildShow(bundleId: bundleId)
        case "music.play":
            return buildPlay(bundleId: bundleId, parameters: parameters)
        case "music.pause":
            return buildPause(bundleId: bundleId)
        case "music.next":
            return buildNext(bundleId: bundleId)
        case "music.previous":
            return buildPrevious(bundleId: bundleId)
        case "music.now_playing":
            return buildNowPlaying(bundleId: bundleId)
        default:
            throw ExecutorError.invalidRequest("Unknown music template: \(templateId)")
        }
    }

    // MARK: - Readonly

    private static func buildListPlaylists(bundleId: String) -> String {
        """
        tell application id "\(bundleId)"
            set playlistList to {}
            repeat with p in playlists
                set end of playlistList to {pId:id of p, pName:name of p, trackCount:(count of tracks of p)}
            end repeat
            set output to "["
            repeat with i from 1 to count of playlistList
                set p to item i of playlistList
                set output to output & "{\\"id\\":\\"" & pId of p & "\\",\\"name\\":\\"" & pName of p & "\\",\\"type\\":\\"playlist\\",\\"itemCount\\":" & (trackCount of p as text) & "}"
                if i < (count of playlistList) then set output to output & ","
            end repeat
            set output to output & "]"
            return output
        end tell
        """
    }

    private static func buildListTracks(bundleId: String, parameters: [String: Any]) -> String {
        let playlistId = parameters["playlistId"] as? String ?? ""
        let limit = parameters["limit"] as? Int ?? 50
        let offset = parameters["offset"] as? Int ?? 0

        let targetClause: String
        if !playlistId.isEmpty {
            targetClause = "tracks of playlist id \"\(esc(playlistId))\""
        } else {
            targetClause = "tracks of library playlist 1"
        }

        return """
        tell application id "\(bundleId)"
            set allTracks to \(targetClause)
            set totalCount to count of allTracks
            set startIdx to \(offset + 1)
            set endIdx to \(offset + limit)
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
                    set output to output & "{\\"id\\":\\"" & tId & "\\",\\"name\\":\\"" & tName & "\\",\\"type\\":\\"track\\",\\"properties\\":{\\"artist\\":\\"" & tArtist & "\\",\\"album\\":\\"" & tAlbum & "\\",\\"duration\\":" & tDuration & "}}"
                    if i < endIdx then set output to output & ","
                end repeat
            end if
            set output to output & "]}"
            return output
        end tell
        """
    }

    private static func buildGetTrack(bundleId: String, parameters: [String: Any]) throws -> String {
        guard let trackId = parameters["trackId"] as? String, !trackId.isEmpty else {
            throw ExecutorError.invalidRequest("music.get_track requires 'trackId' parameter")
        }
        return """
        tell application id "\(bundleId)"
            set t to first track of library playlist 1 whose id is "\(esc(trackId))"
            set tId to id of t
            set tName to name of t
            set tArtist to artist of t
            set tAlbum to album of t
            set tDuration to duration of t
            set tGenre to genre of t
            set tYear to year of t
            set tRating to rating of t
            set tPlays to played count of t
            return "{\\"id\\":\\"" & tId & "\\",\\"name\\":\\"" & tName & "\\",\\"type\\":\\"track\\",\\"properties\\":{\\"artist\\":\\"" & tArtist & "\\",\\"album\\":\\"" & tAlbum & "\\",\\"duration\\":" & tDuration & ",\\"genre\\":\\"" & tGenre & "\\",\\"year\\":" & tYear & ",\\"rating\\":" & tRating & ",\\"playCount\\":" & tPlays & "}}"
        end tell
        """
    }

    private static func buildSearchTracks(bundleId: String, parameters: [String: Any]) throws -> String {
        guard let query = parameters["query"] as? String, !query.isEmpty else {
            throw ExecutorError.invalidRequest("music.search_tracks requires 'query' parameter")
        }
        let limit = parameters["limit"] as? Int ?? 20

        return """
        tell application id "\(bundleId)"
            set matchingTracks to (search library playlist 1 for "\(esc(query))")
            set resultCount to count of matchingTracks
            if resultCount > \(limit) then set resultCount to \(limit)
            set output to "["
            repeat with i from 1 to resultCount
                set t to item i of matchingTracks
                set tId to id of t
                set tName to name of t
                set tArtist to artist of t
                set output to output & "{\\"id\\":\\"" & tId & "\\",\\"name\\":\\"" & tName & "\\",\\"type\\":\\"track\\",\\"properties\\":{\\"artist\\":\\"" & tArtist & "\\"}}"
                if i < resultCount then set output to output & ","
            end repeat
            set output to output & "]"
            return output
        end tell
        """
    }

    // MARK: - Create

    private static func buildCreatePlaylist(bundleId: String, parameters: [String: Any]) throws -> String {
        guard let name = parameters["name"] as? String, !name.isEmpty else {
            throw ExecutorError.invalidRequest("music.create_playlist requires 'name' parameter")
        }
        let description = esc(parameters["description"] as? String ?? "")
        return """
        tell application id "\(bundleId)"
            set newPlaylist to make new playlist with properties {name:"\(esc(name))", description:"\(description)"}
            set pId to id of newPlaylist
            return "{\\"id\\":\\"" & pId & "\\",\\"name\\":\\"\(esc(name))\\",\\"type\\":\\"playlist\\"}"
        end tell
        """
    }

    // MARK: - Actions

    private static func buildPlay(bundleId: String, parameters: [String: Any]) -> String {
        let trackId = parameters["trackId"] as? String ?? ""
        if !trackId.isEmpty {
            return """
            tell application id "\(bundleId)"
                set t to first track of library playlist 1 whose id is "\(esc(trackId))"
                play t
                return "{\\"playing\\":true,\\"track\\":\\"" & (name of t) & "\\"}"
            end tell
            """
        }
        return """
        tell application id "\(bundleId)"
            play
            return "{\\"playing\\":true}"
        end tell
        """
    }

    private static func buildPause(bundleId: String) -> String {
        """
        tell application id "\(bundleId)"
            pause
            return "{\\"paused\\":true}"
        end tell
        """
    }

    private static func buildNext(bundleId: String) -> String {
        """
        tell application id "\(bundleId)"
            next track
            delay 0.5
            set t to current track
            return "{\\"track\\":\\"" & (name of t) & "\\",\\"artist\\":\\"" & (artist of t) & "\\"}"
        end tell
        """
    }

    private static func buildPrevious(bundleId: String) -> String {
        """
        tell application id "\(bundleId)"
            previous track
            delay 0.5
            set t to current track
            return "{\\"track\\":\\"" & (name of t) & "\\",\\"artist\\":\\"" & (artist of t) & "\\"}"
        end tell
        """
    }

    private static func buildNowPlaying(bundleId: String) -> String {
        """
        tell application id "\(bundleId)"
            if player state is playing then
                set t to current track
                set tName to name of t
                set tArtist to artist of t
                set tAlbum to album of t
                set tPos to player position
                set tDur to duration of t
                return "{\\"playing\\":true,\\"track\\":\\"" & tName & "\\",\\"artist\\":\\"" & tArtist & "\\",\\"album\\":\\"" & tAlbum & "\\",\\"position\\":" & tPos & ",\\"duration\\":" & tDur & "}"
            else
                return "{\\"playing\\":false}"
            end if
        end tell
        """
    }

    private static func buildShow(bundleId: String) -> String {
        """
        tell application id "\(bundleId)"
            activate
            return "{\\"shown\\":true}"
        end tell
        """
    }

    private static func esc(_ s: String) -> String {
        s.replacingOccurrences(of: "\\", with: "\\\\")
         .replacingOccurrences(of: "\"", with: "\\\"")
    }
}
