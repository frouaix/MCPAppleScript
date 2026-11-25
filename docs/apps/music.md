# Music

Uses AppleScript and requires macOS Automation consent. Operations are implemented but have not all been verified against a real Music library.

- `app.list_containers`, `app.list`, `app.get`, `app.search`: list playlists, browse tracks, get a track, or search the library.
- `app.create`: create a playlist with `properties.name` and optional `description`.
- `app.action`: `now_playing` reports playback; `play` resumes or plays an optional `parameters.trackId`; `pause`, `next`, and `previous` control playback; `show` opens Music.

Use `app: "music"` for generic calls. `now_playing` requires `read`; other actions require `readwrite`. Updating or deleting tracks is unsupported.

**Scenarios:** find a track and play it; check what is currently playing.
