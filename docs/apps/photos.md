# Photos

Uses PhotoKit. The macOS Photos grant permits OS-level writes even with an MCP read-only grant; limited access restricts visible results.

- `photos.list_recent`: list recent photo and video metadata, optionally by `albumId`, with pagination.
- `app.list_containers`, `app.list`, `app.get`, `app.search`: list regular albums, browse or get media metadata, and search captions.
- `app.create`: create an album with `properties.name`.
- `app.action` with `import`: import an image or video using an absolute `parameters.filePath` and optional `albumId`. `show` opens Photos.

Use `app: "photos"` for generic calls. Caption search requires macOS 27 and a helper built with the macOS 27 SDK. Image contents are not returned; smart/shared albums and some hidden or burst items may be absent. See [details](../TOOLS.md#photos).

**Scenarios:** list five recent photos with `photos.list_recent` and `limit: 5`; search photo captions using `app.search`.
