# Notes

Uses AppleScript and requires macOS Automation consent.

- `notes.list_folders`, `notes.list_notes`: list folders or notes, optionally filtering by `folderId` and paginating the latter.
- `notes.search_notes`: search titles and plain-text bodies, optionally by folder.
- `notes.get_note`: read a note's plain-text body using `noteId`.
- `app.list_containers`, `app.list`, `app.get`, `app.search`: generic equivalents using `app: "notes"`.
- `app.create`, `app.update`, `app.delete`: create, update, or delete a note. Create accepts `title`, `body`, and optional folder `containerId`; update accepts `name` and `body`.
- `app.action` with `show`: open Notes; optionally supply `parameters.noteId`.

**Scenarios:** find a note containing a phrase and read it; create a note in a selected folder.
