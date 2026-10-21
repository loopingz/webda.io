# Binary

Services to handle binary files.

Available implementations: S3Binary, FileBinary, GoogleStorageBinary

These services are responsible for storing and retrieving binary files attached to CoreModel.

Like Stores they define where your data is stored but should barely be used directly.

The storage is optimized to avoid storing the same file multiple times. And it also includes a challenge system to avoid uploading files that are already stored in the system. Allowing users to prove they have the file without uploading it by providing two hashes of the file.

For direct URL-addressed stream read/write access (e.g. `s3://bucket/key`, `gs://bucket/key`) without model binding or deduplication hashes, see [Content Storage](./ContentStorage.md).

## Upload sequence

Attaching a binary to an attribute is a short handshake. The client never gets the server to trust a value it announced: for new content the server reads the bytes back and checks them before linking.

1. **Challenge** - `PUT /<plural>/{uuid}/<attribute>` with `{ hash, challenge, size?, name?, mimetype?, metadata? }`, where `hash` is the md5 of the content and `challenge` the md5 of `"WEBDA" + content`. The answer is `{ done, md5, url?, method?, headers? }`.
   - `done: true`: the content is already stored and the caller proved they have it (challenge matching a server-verified proof), the binary is attached at once with the size of the stored object. Nothing else to do.
   - otherwise `url` is a presigned URL for a direct upload. S3Binary also records a pending marker for the upload.
2. **PUT** - the client uploads the bytes to `url` with the returned `method` and `headers` (including `Content-MD5` set to `md5`).
3. **Complete** - `POST /<plural>/{uuid}/<attribute>/complete/{hash}`. The server streams the stored object, checks that md5(bytes) equals `hash` and that md5(`"WEBDA"` + bytes) equals the announced challenge, writes the `vproof_` proof and only then attaches the binary. Without a successful `complete` nothing is linked. `complete` is a no-op when the hash is already linked, and answers `404` when no pending upload exists, `412` when the uploaded object is not there yet (the pending marker stays so the client can retry) and `400` when the size exceeds `maxUploadSize` or the bytes do not match the announced hash or challenge (the pending marker and the unused data are then removed).

The `complete` route is a regular Behavior action: it goes through the model permissions as `<attribute>.complete`, like `<attribute>.attach` or `<attribute>.delete`.

FileBinary uploads through the server, so it attaches right after its own upload; its `complete` resolves once the binary is linked and answers `412` otherwise.

A pending S3 upload that is never completed is swept after `pendingTimeout` seconds: the marker, and the uploaded data when nothing else uses it.

### Parameters

| Parameter        | Default | Description                                                                                                                                                                                                |
| ---------------- | ------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `maxUploadSize`  | none    | Maximum size in bytes. When set, the challenge must announce a finite, non-negative `size` no larger than the limit. S3Binary signs the URL with that `ContentLength` and checks the stored size on dedup. |
| `urlExpiry`      | `30`    | Lifetime, in seconds, of the presigned URLs.                                                                                                                                                               |
| `pendingTimeout` | `86400` | S3Binary only: seconds before a pending upload is swept.                                                                                                                                                   |

### Events

`Binary.UploadSuccess` is emitted once for each newly linked item, whatever the path (server upload, challenge dedup or `complete`), with `{ object, service, target }`. Linking a hash that is already attached to the attribute does not emit it again. For an attribute declared as a `Binaries` collection (or any `BinariesImpl` subclass) the event fires per item.

## Deleting a model

Deleting a model deletes its binaries (the repository `Delete`/`Deleted` hooks run the cascade). A stored hash shared by several models is kept until its last usage is removed.

## Migration

Proofs of possession are now stored as `vproof_<challenge>` markers next to the data, and only the server writes them, from a challenge it computed from bytes it read: on `complete`, on its own uploads (`store`, FileBinary uploads). Only `vproof_` markers are accepted for dedup.

Markers written by earlier versions (`proof_<challenge>`, the older `_<challenge>` for FileBinary and `challenge_<challenge>` for S3Binary) came from values announced by the client and are ignored: they neither attach a binary nor count as usages. A holder of such content goes through the upload sequence once (challenge, PUT, `complete`), which writes the `vproof_` marker; later challenges for the same content dedup again. Legacy markers are removed with the data when its last usage goes.

Hashes and challenges are lower-case hexadecimal: the server normalises them, so an upper-case value names the same content.

Deleting a model removes only that model's usage markers: deduplicated data shared with other models (and its proofs) is removed once no usage and no pending upload remain.

S3Binary and GCS Storage usage markers now name the model: `@<model>_<attribute>_<uuid>`, each part encoded so `_` only separates parts (FileBinary already wrote `<model>_<attribute>_<uuid>`). Markers written by earlier versions (`<attribute>_<uuid>`, the model only in their metadata) still count as usages and need no migration: deleting an object removes such a marker only when its stored model (`x-amz-meta-store` on S3, `webdaModel` on GCS) is the object's model.

## Map

Binary services define who is responsible for what fields of your CoreModel. With a map, you can define which fields of which objects can store binaries.

```javascript title="webda.config.json"
"map": {
	"users": ["s3images"]
}
```

The above configuration will allow a user to link a binary to a user on the field s3images.

## S3Binary

To configure just add the parameter bucket

\{@link S3Binary}

## FileBinary

To configure just add the parameter folder
