# Content Storage

Webda provides unified URL-addressed streaming access to binary objects across cloud and local storage backends via the `ContentStorage` interface and free functions `getContent` and `putContent`.

Unlike model-attached `BinaryService` methods (`store`, `_get`), `getContent` and `putContent` operate directly on arbitrary storage URLs using `Readable` streams end-to-end, with **no local staging on disk** and no buffering of full bodies in memory.

## Usage

```ts
import { getContent, putContent } from "@webda/core";

// Stream a file directly to S3
await putContent("s3://my-bucket/exports/2026.ndjson.gz", readableStream);

// Read back from Google Cloud Storage as a stream
const stream = await getContent("gs://my-bucket/exports/2026.ndjson.gz");
```

## Supported URL Schemes

| URL Format | Meaning | Provider |
|---|---|---|
| `s3://bucket/key` | Explicit S3 bucket and object key | `@webda/aws` (`S3Binary`) |
| `gs://bucket/key`, `gcs://bucket/key` | Explicit GCS bucket and object key | `@webda/gcp` (`Storage`) |
| `s3:///key` or `s3:key` | S3 object in the scheme's **default bucket** | Default `S3Binary` provider |
| `gs:///key` or `gs:key` | GCS object in the scheme's **default bucket** | Default `Storage` provider |
| `file:///abs/path`, `/abs/path`, `./rel/path` | Local filesystem path | `FileContentStorage` / `@webda/fs` (`FileBinary`) |
| `memory://name/key` | In-memory key-value store | `MemoryContentStorage` (testing) |

:::caution Caveat: `s3:///key` vs `s3://key`
Under WHATWG URL standards, `s3://key` parses `key` as the *hostname* (bucket name), making it indistinguishable from a single-segment bucket URL. To address the default bucket for a scheme, use `s3:///key` (with three slashes, representing an empty host) or `s3:key`.
:::

## Resolution Order

When `getContent(url)` or `putContent(url, body)` is called, the URL is resolved using `ContentStorages.resolve(url)` according to the following precedence:

1. **Bucket-bound Provider:** A provider registered with `{ bucket }` that matches the scheme and bucket in the URL (e.g. an `S3Binary` service whose `bucket` is `my-bucket` handles `s3://my-bucket/...` using its configured credentials, region, and endpoint).
2. **Scheme Default Provider:** The provider registered with `{ default: true }` for the scheme.
3. **First Registered Provider:** The first provider registered for that scheme.
4. If no provider matches, a `ContentStorageNotFoundError` is thrown.
5. Bare filesystem paths (`/abs/path`, `./rel/path`) or `file://` URLs always resolve to local filesystem storage (`FileContentStorage`).

## Configuration

Services extending `CloudBinary` (`S3Binary`, `Storage`, `FileBinary`) automatically implement `ContentStorage` and register themselves with `ContentStorages` during `init()`:

```json title="webda.config.json"
{
  "services": {
    "s3": {
      "type": "@webda/aws/S3Binary",
      "params": {
        "bucket": "my-app-uploads",
        "contentStorage": {
          "register": true,
          "default": true
        }
      }
    }
  }
}
```

- `contentStorage.register` (default `true`): Whether to register with `ContentStorages`.
- `contentStorage.default` (default `false`): Whether to mark this service as the default provider for its schemes.

## API Reference

### `getContent(url: string, options?: ContentGetOptions): Promise<Readable>`

Retrieves a stream for the specified URL. Supports partial reads via `options.range: { start: number, end?: number }`. Throws `ContentNotFoundError` if the object does not exist.

### `putContent(url: string, body: ContentBody, options?: ContentPutOptions): Promise<ContentInfo>`

Uploads data to the specified URL. `body` may be a `Readable`, `Buffer`, or `string` (treated as utf-8 content, NOT a local file path).

Options:
- `contentType?: string`: MIME type. Defaults to the type inferred from the key's file extension, or `application/octet-stream`.
- `metadata?: Record<string, string>`: Custom metadata attached to the object.
- `ifNotExists?: boolean`: When true, fails with `ContentExistsError` if the destination object already exists (e.g. via S3 `If-None-Match: "*"` or GCS `ifGenerationMatch: 0`).

## Deprecations & Migration Notes

The introduction of `ContentStorage` unifies binary operations across backends. The following legacy methods are marked `@deprecated`:

- **`S3Binary.getObject(key, bucket)`**: Deprecated in favor of `s3Binary.getContent(url)` or `getContent("s3://bucket/key")`.
- **`S3Binary.putObject(key, body, metadata, bucket)`**: Deprecated in favor of `s3Binary.putContent(url, body, options)` or `putContent("s3://bucket/key", body, options)`. Note that `putContent` streams unknown-length bodies via multipart upload without staging on disk.
- **`Storage.getContent({ bucket, key })`**: The object parameter form is deprecated in favor of `storage.getContent(url)` or `getContent("gs://bucket/key")`.
- **`Storage.putObject(key, body, metadata, bucket)`** (where `body` was a local file path): Deprecated in favor of `putContent("gs://bucket/key", fs.createReadStream(filePath))` or `storage.putContent(...)`.
