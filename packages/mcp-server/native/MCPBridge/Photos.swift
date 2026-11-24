import AppKit
import Foundation
import Photos
import UniformTypeIdentifiers

struct PhotosRequest: Decodable {
    let operation: String
    let albumId: String?
    let itemId: String?
    let query: String?
    let name: String?
    let filePath: String?
    let limit: Int?
    let offset: Int?
}

func validatePhotosRequest(_ request: PhotosRequest) throws {
    let operations = ["photos.list_albums", "photos.list_items", "photos.get_item",
                      "photos.search_items", "photos.create_album", "photos.import", "photos.show"]
    guard operations.contains(request.operation) else { try fail("Unsupported Photos operation.") }
    guard (1...200).contains(request.limit ?? 50), (request.offset ?? 0) >= 0 else {
        try fail("Invalid Photos pagination.")
    }
    if request.operation == "photos.get_item" && (request.itemId?.isEmpty ?? true) {
        try fail("Photo ID is required.")
    }
    if request.operation == "photos.search_items" && (request.query?.isEmpty ?? true) {
        try fail("Search query is required.")
    }
    if request.operation == "photos.create_album" &&
        (request.name?.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty ?? true) {
        try fail("Album name is required.")
    }
    if request.operation == "photos.import" {
        guard let path = request.filePath, (path as NSString).isAbsolutePath else {
            try fail("Import file path must be absolute.")
        }
    }
}

func photoCaption(_ asset: PHAsset) -> String? {
    #if compiler(>=6.4)
    if #available(macOS 27.0, *) { return asset.extendedMetadata.caption }
    #endif
    return nil
}

func photoData(_ asset: PHAsset) -> [String: Any] {
    let filename = PHAssetResource.assetResources(for: asset).first?.originalFilename ?? ""
    let mediaType: String
    switch asset.mediaType {
    case .image: mediaType = "photo"
    case .video: mediaType = "video"
    case .audio: mediaType = "audio"
    default: mediaType = "unknown"
    }
    var properties: [String: Any] = [
        "width": asset.pixelWidth, "height": asset.pixelHeight, "favorite": asset.isFavorite,
        "date": asset.creationDate.map { formatEventDate($0, in: .current) } as Any? ?? NSNull(),
        "mediaType": mediaType,
    ]
    if let caption = photoCaption(asset) { properties["description"] = caption }
    return ["id": asset.localIdentifier, "name": filename, "type": "media", "properties": properties]
}

func photosMatchingCaption(_ caption: String?, query: String) -> Bool {
    return caption?.localizedCaseInsensitiveContains(query) ?? false
}

func photosAlbum(_ id: String) throws -> PHAssetCollection {
    let result = PHAssetCollection.fetchAssetCollections(withLocalIdentifiers: [id], options: nil)
    guard let album = result.firstObject else { try fail("Photo album not found; list albums again.") }
    return album
}

func photosFetchOptions(prefetchCaptions: Bool = false) -> PHFetchOptions {
    let options = PHFetchOptions()
    options.sortDescriptors = [NSSortDescriptor(key: "creationDate", ascending: false)]
    #if compiler(>=6.4)
    if #available(macOS 27.0, *) { options.prefetchAssetExtendedMetadata = prefetchCaptions }
    #endif
    return options
}

func photoPageBounds(total: Int, offset: Int, limit: Int) -> Range<Int> {
    let start = min(offset, total)
    return start..<(start + min(limit, total - start))
}

func requirePhotoCaptionSupport() throws {
    #if compiler(>=6.4)
    if #available(macOS 27.0, *) { return }
    #endif
    try fail("Photos caption search requires macOS 27 and a helper built with the macOS 27 SDK.")
}

func executePhotosRequest(_ request: PhotosRequest) async throws -> Any {
    try validatePhotosRequest(request)
    if request.operation == "photos.show" {
        guard let url = NSWorkspace.shared.urlForApplication(withBundleIdentifier: "com.apple.Photos") else {
            try fail("Photos app not found.")
        }
        _ = try await NSWorkspace.shared.openApplication(at: url, configuration: NSWorkspace.OpenConfiguration())
        return ["shown": true]
    }
    if request.operation == "photos.search_items" { try requirePhotoCaptionSupport() }
    let status = await withCheckedContinuation { continuation in
        PHPhotoLibrary.requestAuthorization(for: .readWrite) { continuation.resume(returning: $0) }
    }
    guard status == .authorized || status == .limited else {
        try fail("Photos access denied. Enable access in System Settings > Privacy & Security > Photos.")
    }
    return try await executePhotos(request, limited: status == .limited)
}

func executePhotos(_ request: PhotosRequest, limited: Bool) async throws -> Any {
    switch request.operation {
    case "photos.list_albums":
        let albums = PHAssetCollection.fetchAssetCollections(with: .album, subtype: .albumRegular, options: nil)
        var result: [[String: Any]] = []
        albums.enumerateObjects { album, _, _ in
            result.append(["id": album.localIdentifier, "name": album.localizedTitle ?? "",
                           "type": "album", "itemCount": PHAsset.fetchAssets(in: album, options: nil).count])
        }
        return result
    case "photos.list_items", "photos.search_items":
        let options = photosFetchOptions(prefetchCaptions: request.operation == "photos.search_items")
        options.predicate = NSPredicate(format: "mediaType == %d OR mediaType == %d",
                                        PHAssetMediaType.image.rawValue, PHAssetMediaType.video.rawValue)
        let assets: PHFetchResult<PHAsset>
        if let id = request.albumId, !id.isEmpty {
            assets = PHAsset.fetchAssets(in: try photosAlbum(id), options: options)
        } else {
            assets = PHAsset.fetchAssets(with: options)
        }
        let offset = request.offset ?? 0
        let limit = request.limit ?? (request.operation == "photos.search_items" ? 20 : 50)
        if request.operation == "photos.list_items" {
            let bounds = photoPageBounds(total: assets.count, offset: offset, limit: limit)
            let items = bounds.map { photoData(assets.object(at: $0)) }
            return ["total": assets.count, "offset": offset, "hasMore": bounds.upperBound < assets.count,
                    "limitedAccess": limited, "items": items] as [String: Any]
        }
        var total = 0
        var items: [[String: Any]] = []
        assets.enumerateObjects { asset, _, _ in
            if !photosMatchingCaption(photoCaption(asset), query: request.query ?? "") { return }
            if total >= offset && items.count < limit { items.append(photoData(asset)) }
            total += 1
        }
        return ["total": total, "offset": offset, "hasMore": offset < total && items.count < total - offset,
                "limitedAccess": limited, "items": items] as [String: Any]
    case "photos.get_item":
        let assets = PHAsset.fetchAssets(withLocalIdentifiers: [request.itemId!], options: photosFetchOptions())
        guard let asset = assets.firstObject else { try fail("Photo not found; list photos again.") }
        return photoData(asset)
    case "photos.create_album":
        var identifier: String?
        try await PHPhotoLibrary.shared().performChanges {
            let change = PHAssetCollectionChangeRequest.creationRequestForAssetCollection(withTitle: request.name!)
            identifier = change.placeholderForCreatedAssetCollection.localIdentifier
        }
        guard let id = identifier else { try fail("Photos created an album without returning an ID.") }
        return ["id": id, "name": request.name!, "type": "album"]
    case "photos.import":
        let path = request.filePath!
        let url = URL(fileURLWithPath: path)
        guard let type = UTType(filenameExtension: url.pathExtension) else {
            try fail("Unsupported photo or video file type.")
        }
        let resourceType: PHAssetResourceType
        if type.conforms(to: .image) { resourceType = .photo }
        else if type.conforms(to: .movie) { resourceType = .video }
        else { try fail("Unsupported photo or video file type.") }
        let album = try request.albumId.flatMap { $0.isEmpty ? nil : try photosAlbum($0) }
        if let album = album, !album.canPerform(.addContent) {
            try fail("The selected Photos album cannot accept new items.")
        }
        var identifier: String?
        var changeError: String?
        try await PHPhotoLibrary.shared().performChanges {
            let albumChange = album.flatMap { PHAssetCollectionChangeRequest(for: $0) }
            if album != nil && albumChange == nil {
                changeError = "Could not modify the selected Photos album."
                return
            }
            let creation = PHAssetCreationRequest.forAsset()
            creation.addResource(with: resourceType, fileURL: url, options: nil)
            guard let placeholder = creation.placeholderForCreatedAsset else {
                changeError = "Photos did not provide an ID for the imported item."
                return
            }
            identifier = placeholder.localIdentifier
            albumChange?.addAssets([placeholder] as NSArray)
        }
        if let error = changeError { try fail(error) }
        guard let id = identifier else { try fail("Photos did not return an ID for the imported item.") }
        return ["imported": true, "id": id, "filePath": path]
    default:
        try fail("Unsupported Photos operation.")
    }
}
