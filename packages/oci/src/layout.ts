import { createHash, randomUUID } from "node:crypto";
import {
  createReadStream,
  createWriteStream,
  existsSync,
  mkdirSync,
  readFileSync,
  renameSync,
  rmSync,
  statSync,
  writeFileSync
} from "node:fs";
import { dirname, join } from "node:path";
import { Readable, Transform } from "node:stream";
import { pipeline } from "node:stream/promises";
import { createGzip } from "node:zlib";
import { type Descriptor, type ImageIndex, MediaTypes, sha256, toJsonBytes } from "./oci.js";
import { generateTar, type TarEntry, type TarOptions } from "./tar.js";

/**
 * Content of the `oci-layout` file
 */
const OCI_LAYOUT = { imageLayoutVersion: "1.0.0" };

/**
 * Offset of the OS field in the gzip header
 */
const GZIP_OS_OFFSET = 9;

/**
 * Set the OS field of a gzip stream header to unix: zlib writes the code of the build platform
 *
 * @returns the transform, patching the header whatever the size of the chunks
 */
export function forceUnixGzipOs(): Transform {
  let offset = 0;
  return new Transform({
    transform(chunk: Buffer, _encoding, callback) {
      if (offset <= GZIP_OS_OFFSET && offset + chunk.length > GZIP_OS_OFFSET) {
        chunk[GZIP_OS_OFFSET - offset] = 3;
      }
      offset += chunk.length;
      callback(null, chunk);
    }
  });
}

/**
 * An OCI image layout on disk: `oci-layout`, `index.json` and `blobs/sha256/<hex>`
 *
 * It is the build output and the source of the push.
 */
export class ImageLayout {
  /**
   * @param path - folder of the layout
   */
  constructor(public readonly path: string) {
    mkdirSync(join(path, "blobs", "sha256"), { recursive: true });
    writeFileSync(join(path, "oci-layout"), JSON.stringify(OCI_LAYOUT));
  }

  /**
   * Path of a blob
   *
   * @param digest - the blob digest
   * @returns the file path
   */
  blobPath(digest: string): string {
    const [algorithm, hex] = digest.split(":");
    if (algorithm !== "sha256" || !/^[a-f0-9]{64}$/.test(hex ?? "")) {
      throw new Error(`Unsupported digest '${digest}'`);
    }
    return join(this.path, "blobs", algorithm, hex);
  }

  /**
   * Check whether a blob is in the layout
   *
   * @param digest - the blob digest
   * @returns true if present
   */
  hasBlob(digest: string): boolean {
    return existsSync(this.blobPath(digest));
  }

  /**
   * Read a blob
   *
   * @param digest - the blob digest
   * @returns the content
   */
  readBlob(digest: string): Buffer {
    return readFileSync(this.blobPath(digest));
  }

  /**
   * Size of a blob
   *
   * @param digest - the blob digest
   * @returns the size in bytes
   */
  blobSize(digest: string): number {
    return statSync(this.blobPath(digest)).size;
  }

  /**
   * Stream a blob
   *
   * @param digest - the blob digest
   * @returns the stream
   */
  blobStream(digest: string): Readable {
    return createReadStream(this.blobPath(digest));
  }

  /**
   * Write a blob from memory
   *
   * @param data - the content
   * @param mediaType - its media type
   * @returns its descriptor
   */
  writeBlob(data: Buffer, mediaType: string): Descriptor {
    const digest = sha256(data);
    const path = this.blobPath(digest);
    if (!existsSync(path)) {
      writeFileSync(path, data);
    }
    return { mediaType, digest, size: data.length };
  }

  /**
   * Write a JSON blob
   *
   * @param value - the document
   * @param mediaType - its media type
   * @returns its descriptor
   */
  writeJson(value: any, mediaType: string): Descriptor {
    return this.writeBlob(toJsonBytes(value), mediaType);
  }

  /**
   * Write a blob from a stream, checking its digest when one is expected
   *
   * @param stream - the content
   * @param expected - the expected digest
   * @returns the digest and size
   */
  async writeStream(stream: Readable | ReadableStream, expected?: string): Promise<{ digest: string; size: number }> {
    const temporary = join(this.path, "blobs", `.tmp-${randomUUID()}`);
    const hash = createHash("sha256");
    let size = 0;
    try {
      await pipeline(
        stream instanceof Readable ? stream : Readable.fromWeb(stream as any),
        new Transform({
          transform(chunk, _encoding, callback) {
            hash.update(chunk);
            size += chunk.length;
            callback(null, chunk);
          }
        }),
        createWriteStream(temporary)
      );
      const digest = `sha256:${hash.digest("hex")}`;
      if (expected && digest !== expected) {
        throw new Error(`Digest mismatch: expected ${expected}, got ${digest}`);
      }
      renameSync(temporary, this.blobPath(digest));
      return { digest, size };
    } finally {
      rmSync(temporary, { force: true });
    }
  }

  /**
   * Create a gzip layer from tar entries
   *
   * The tar is reproducible (see {@link generateTar}) and the gzip header carries no timestamp
   * and the unix OS code, so the same entries give the same layer digest.
   *
   * @param entries - sorted entries, see {@link withDirectories}
   * @param options - shared tar options
   * @returns the layer descriptor and its uncompressed digest (diff id)
   */
  async writeLayer(entries: TarEntry[], options: TarOptions = {}): Promise<{ descriptor: Descriptor; diffId: string }> {
    const temporary = join(this.path, "blobs", `.tmp-${randomUUID()}`);
    const diffHash = createHash("sha256");
    const hash = createHash("sha256");
    let size = 0;
    try {
      await pipeline(
        Readable.from(generateTar(entries, options)),
        new Transform({
          transform(chunk, _encoding, callback) {
            diffHash.update(chunk);
            callback(null, chunk);
          }
        }),
        createGzip({ level: 6 }),
        forceUnixGzipOs(),
        new Transform({
          transform(chunk: Buffer, _encoding, callback) {
            hash.update(chunk);
            size += chunk.length;
            callback(null, chunk);
          }
        }),
        createWriteStream(temporary)
      );
      const digest = `sha256:${hash.digest("hex")}`;
      mkdirSync(dirname(this.blobPath(digest)), { recursive: true });
      renameSync(temporary, this.blobPath(digest));
      return {
        descriptor: { mediaType: MediaTypes.OCI_LAYER_GZIP, digest, size },
        diffId: `sha256:${diffHash.digest("hex")}`
      };
    } finally {
      rmSync(temporary, { force: true });
    }
  }

  /**
   * Write the `index.json` of the layout
   *
   * @param manifests - descriptors of the images or index, with their `org.opencontainers.image.ref.name`
   */
  writeIndex(manifests: Descriptor[]) {
    const index: ImageIndex = { schemaVersion: 2, mediaType: MediaTypes.OCI_INDEX, manifests };
    writeFileSync(join(this.path, "index.json"), JSON.stringify(index, undefined, 2));
  }

  /**
   * Read the `index.json` of the layout
   *
   * @returns the index
   */
  readIndex(): ImageIndex {
    return JSON.parse(readFileSync(join(this.path, "index.json")).toString());
  }
}
