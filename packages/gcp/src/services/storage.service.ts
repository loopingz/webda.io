import { Bucket, File, Storage as GCS, GetSignedUrlConfig, StorageOptions } from "@google-cloud/storage";
import {
  BinaryFile,
  BinaryFileInfo,
  BinaryMap,
  CloudBinary,
  CloudBinaryParameters,
  CoreModel,
  OperationContext,
  useModelId
} from "@webda/core";
import { StorageFinder, Throttler } from "@webda/utils";
import { createReadStream } from "fs";
import * as mime from "mime-types";
import { Readable, Stream, Writable } from "node:stream";
import { pipeline } from "node:stream/promises";

export type StorageObject = {
  key: string;

  /**
   * bucket is an option,
   * if not provided: it will get the DEFAULT_BUCKET set from environment variable
   */
  bucket?: string;
};

export type DownloadParams = StorageObject & {
  localPath: string;
};

export type PutObjectParams = StorageObject & {
  localPath?: string;
  content?: string | Buffer;
};

export type SignedUrlParams = StorageObject & {
  expires?: number;
  action: "read" | "write" | "delete";
  contentMd5?: string;
  contentType?: string;
  extensionHeaders?: { [key: string]: string };
  responseDisposition?: string;
  queryParams?: { [key: string]: string };
};

export type StorageObjectMeta = {
  size: number;
  contentType: string;
};

/**
 * Configuration for {@link Storage}
 */
export class StorageParameters extends CloudBinaryParameters {
  /**
   * Bucket to store binaries in
   */
  bucket: string;
  /**
   * Specify endpoint for GCS
   */
  endpoint?: string;
}

/**
 * Google Storage Finder implementation
 */
export class GCSFinder implements StorageFinder {
  private _storage: GCS;
  /**
   * @param options - GCS client options
   */
  constructor(options?: StorageOptions) {
    this._storage = new GCS(options);
  }

  /**
   * Get info from url
   * @param path - the gs:// url
   * @returns the bucket and key
   */
  getInfo(path: string): { bucket: string; key: string } {
    const url = new URL(path);
    if (url.protocol !== "gs:") {
      throw new Error("Invalid protocol path should be gs://bucket/key");
    }
    let key = url.pathname;
    if (key.startsWith("/")) {
      key = key.substring(1);
    }
    return {
      bucket: url.host,
      key
    };
  }

  /**
   * Depth or options is ignored
   * @override
   * @param path - the gs:// url to walk
   * @param processor - called for each file found
   * @param _options - ignored
   * @param _depth - ignored
   */
  async walk(
    path: string,
    processor: (filepath: string) => void,
    _options?: { followSymlinks?: boolean; resolveSymlink?: boolean; includeDir?: boolean; maxDepth?: number },
    _depth?: number
  ): Promise<void> {
    const { bucket, key } = this.getInfo(path);
    let pageToken;
    do {
      const res = await this._storage.bucket(bucket).getFiles(pageToken ? pageToken : { prefix: key });
      for (const file of res[0]) {
        processor(`${path}${file.name}`);
      }
      pageToken = res[1].pageToken;
    } while (pageToken);
  }

  /**
   * Find files under a gs:// url
   * @param currentPath - the gs:// url to search
   * @param options - only `filterPattern` and `processor` are used
   * @returns the files found
   */
  async find(
    currentPath: string,
    options?: { includeDir?: boolean; maxDepth?: number } & {
      filterPattern?: RegExp;
      processor?: (filepath: string) => void;
    }
  ): Promise<string[]> {
    const res = [];
    await this.walk(currentPath, f => {
      if (options?.filterPattern && !options.filterPattern.test(f)) {
        return;
      }
      if (options?.processor) {
        options.processor(f);
      }
      res.push(f);
    });
    return res;
  }

  /**
   * Get a write stream
   * @param path - the gs:// url
   * @returns the write stream
   */
  async getWriteStream(path: string): Promise<Writable> {
    const { bucket, key } = this.getInfo(path);
    return this._storage.bucket(bucket).file(key).createWriteStream();
  }

  /**
   * Get a read stream
   * @param path - the gs:// url
   * @returns the read stream
   */
  async getReadStream(path: string): Promise<Readable> {
    const { bucket, key } = this.getInfo(path);
    return this._storage.bucket(bucket).file(key).createReadStream();
  }
}

/**
 * Storage handles the storage of binary on a Google Cloud Storage bucket
 *
 * See Binary the general interface
 * @WebdaModda GoogleCloudStorage
 */
export default class Storage<T extends StorageParameters = StorageParameters> extends CloudBinary<T> {
  private _storage?: GCS;
  /**
   * GCS client, created on first use
   * @returns the GCS client
   */
  private get storage(): GCS {
    if (!this._storage) {
      this._storage = new GCS({ apiEndpoint: this.parameters.endpoint });
    }
    return this._storage;
  }

  /**
   * @override
   * @param info - the binary map
   * @returns the content stream
   */
  async _get(info: BinaryMap): Promise<Readable> {
    const key = this._getKey(info.hash);
    return this.getContent({ key });
  }

  /**
   * @override
   * @param map - the binary map
   * @param expires - expiration in seconds
   * @param _context - the operation context
   * @returns the signed url
   */
  getSignedUrlFromMap(map: BinaryMap, expires: number, _context: OperationContext): Promise<string> {
    return this.getSignedUrl({
      key: this._getKey(map.hash),
      expires,
      action: "read"
    });
  }

  /**
   * Get object content as a stream
   * @param params - the object to read
   * @param params.bucket - the bucket, default to the one predefined
   * @param params.key - the object key
   * @returns the content stream
   */
  async getContent({ bucket, key }: StorageObject): Promise<Readable> {
    return this.getStorageBucket(bucket).file(key).createReadStream();
  }

  /**
   * Upload a local file to GCS bucket destination
   *
   * @param key - key to add to
   * @param body - content of the object, a string is a local file path
   * @param metadata - to put along the object
   * @param bucket - to use
   */
  async putObject(
    key: string,
    body: Readable | Buffer | string,
    metadata = {},
    bucket: string = this.parameters.bucket
  ): Promise<void> {
    const file = this.getStorageBucket(bucket).file(key);
    let contentType = "application/octet-stream";
    let stream: Readable;
    if (body instanceof Readable) {
      stream = body;
    } else if (body instanceof Buffer) {
      const bufferStream = new Stream.PassThrough();
      bufferStream.end(body);
      stream = bufferStream;
    } else {
      contentType = mime.lookup(body, "application/octet-stream");
      stream = createReadStream(body);
    }
    await pipeline(stream, file.createWriteStream({ contentType, resumable: false }));
    await file.setMetadata({ metadata: metadata });
  }

  /**
   * Return the Google Bucket directly
   *
   * @param bucket - name of the bucket default to the one predefined
   * @returns the bucket
   */
  getStorageBucket(bucket: string = this.parameters.bucket): Bucket {
    return this.storage.bucket(bucket);
  }

  /**
   * @inheritdoc
   * @param hash - the binary hash
   * @param uuid - the object uuid
   * @param property - the object property
   */
  async _cleanUsage(hash: string, uuid: string, property?: string) {
    const suffix = property ? `${property}_${uuid}` : `_${uuid}`;
    let files: File[] = (await this.getStorageBucket().getFiles({ prefix: this._getKey(hash, "") }))[0];
    await Promise.all(files.filter(f => f.name.endsWith(suffix)).map(f => f.delete()));
    // If no more usage, delete the data
    files = files.filter(f => !f.name.endsWith(suffix));
    if (files.length == 1) {
      await Promise.all(files.map(f => f.delete()));
    }
  }

  /**
   * @inheritdoc
   * @param hash - the binary hash
   * @returns the number of objects using the binary
   */
  async getUsageCount(hash: string): Promise<number> {
    const [files] = await this.getStorageBucket().getFiles({
      prefix: this._getKey(hash, "")
    });
    return files.filter(n => !n.name.endsWith("/data")).length;
  }

  /**
   * @inheritdoc
   * @param object - the object to attach the binary to
   * @param property - the object property
   * @param file - the binary to store
   */
  async store(object: CoreModel, property: string, file: BinaryFile): Promise<void> {
    this.checkMap(<any>object, property);
    await file.getHashes();

    const [exists] = await this.getStorageBucket().file(this._getKey(file.hash)).exists();
    // If data already exist no need to upload
    if (!exists) {
      await this.putObject(this._getKey(file.hash), await file.get(), {
        ...file.metadata,
        challenge: file.challenge
      });
    }
    await this.putMarker(file.hash, `${property}_${object.getUUID()}`, useModelId(object.constructor));
    await this.uploadSuccess(<any>object, property, file.toBinaryFileInfo());
  }

  /**
   * Delete a file inside an existing bucket
   * @param params - the object to delete
   * @param params.bucket - the bucket, default to the one predefined
   * @param params.key - the object key
   */
  async deleteObject({ bucket, key }: StorageObject): Promise<void> {
    await this.getStorageBucket(bucket).file(key).delete();
    this.log("DEBUG", `gs://${bucket}/${key} deleted`);
  }

  /**
   * Move a file from one bucket to an other
   * @param source - the object to move
   * @param destination - the new location
   */
  async moveObject(source: StorageObject, destination: StorageObject): Promise<void> {
    const newFile = this.getStorageBucket(destination.bucket).file(destination.key);
    this.log(
      "DEBUG",
      `moveObject gs://${source.bucket}/${source.key} => gs://${destination.bucket}/${destination.key}`
    );
    await this.getStorageBucket(source.bucket).file(source.key).move(newFile);
  }

  /**
   * Get a signed url for the client to upload the binary directly to GCS
   * @param object - the object to attach the binary to
   * @param property - the object property
   * @param info - the binary information (hash, challenge), read from the context if not provided
   * @param context - the operation context
   * @returns the upload url, undefined if the binary is already uploaded
   */
  async putRedirectUrl(
    object: CoreModel,
    property: string,
    info?: BinaryFileInfo & { hash: string; challenge: string },
    context?: OperationContext<any>
  ): Promise<{ url: string; method: string; headers: { [key: string]: string } }> {
    const body = info ?? (await context.getInput());
    this.checkMap(<any>object, property);
    const uuid = object.getUUID();
    const base64String = Buffer.from(body.hash, "hex").toString("base64");
    const params: SignedUrlParams = {
      bucket: this.parameters.bucket,
      key: this._getKey(body.hash, "data"),
      action: "write",
      contentType: "application/octet-stream",
      contentMd5: base64String,
      extensionHeaders: {
        "x-goog-meta-challenge": body.challenge
      }
    };
    // List bucket to check if the file already exist
    let challenge;
    try {
      const res = await this.getStorageBucket().file(params.key).getMetadata();
      challenge = res[0].metadata.challenge;
    } catch {
      // Ignore error: the data does not exist yet
    }
    await this.uploadSuccess(<any>object, property, body);
    await this.putMarker(body.hash, `${property}_${uuid}`, useModelId(object.constructor));
    // If the challenge is the same, no need to upload
    if (challenge && challenge === body.challenge) {
      return;
    }
    const url = await this.getSignedUrl(params);
    // Re-upload, we should probably queue for recheck
    return {
      url,
      method: "PUT",
      headers: {
        "Content-MD5": base64String,
        "Content-Type": "application/octet-stream",
        "x-goog-meta-challenge": body.challenge,
        Host: new URL(url).host
      }
    };
  }

  /**
   * Retrieve one signed URL to download the file in parameter
   * @param params.bucket - the bucket, default to the one predefined
   * @param params.key - the object key
   * @param params.expires - expiration in seconds
   * @param params.action - the action allowed by the url
   * @param params - the object and signature options
   * @returns URL in order to download the file
   */
  async getSignedUrl({ bucket, key, expires = 3600, action = "read", ...params }: SignedUrlParams): Promise<string> {
    const options: GetSignedUrlConfig = {
      version: "v4",
      action,
      ...params,
      expires: Date.now() + expires * 1000
    };
    const [url] = await this.getStorageBucket(bucket).file(key).getSignedUrl(options);
    this.log("TRACE", `The signed url for ${bucket}/${key} is ${url}.`);
    return url;
  }

  /**
   * Retrieve mandatory headers if needed by the cloud provider (ie. Azure)
   * Returns empty object if no headers are mandatory
   * @returns mandatory headers
   */
  getSignedUrlHeaders(): { [key: string]: string } {
    return {};
  }

  /**
   * Retrieve public URL of this object
   * @param params - the object
   * @param params.bucket - the bucket, default to the one predefined
   * @param params.key - the object key
   * @returns Public URL in order to download the file
   */
  async getPublicUrl({ bucket, key }: StorageObject): Promise<string> {
    return this.getStorageBucket(bucket).file(key).publicUrl();
  }

  /**
   * Fetch an object's metadata
   * @param params - the object
   * @param params.bucket - the bucket, default to the one predefined
   * @param params.key - the object key
   * @returns size and content type
   */
  async getMeta({ bucket, key }: StorageObject): Promise<StorageObjectMeta> {
    const [metadata] = await this.getStorageBucket(bucket).file(key).getMetadata();
    return {
      size: typeof metadata.size === "string" ? parseInt(metadata.size) : metadata.size,
      contentType: metadata.contentType
    };
  }

  /**
   * Get a bucket size with a prefix
   * @param bucket - the bucket, default to the one predefined
   * @param prefix - on the bucket
   * @param regex - to filter files
   * @returns the total size and count of files
   */
  async getBucketSize(bucket?: string, prefix?: string, regex?: RegExp) {
    let pageToken;
    const throttler = new Throttler();
    bucket ??= this.parameters.bucket;
    let size = 0;
    let count = 0;
    const dwl = f => {
      return async () => {
        try {
          const metadata = (await f.getMetadata()).shift();
          size += Number.parseInt(metadata.size);
          count++;
        } catch {
          // Ignore files removed while computing
        }
      };
    };
    do {
      const [files, page] = await this.storage.bucket(bucket).getFiles({ maxResults: 1000, pageToken, prefix });
      files.filter(f => (regex ? f.name.match(regex) : true)).forEach(f => throttler.queue(dwl(f)));
      await throttler.wait();
      pageToken = (<any>page)?.pageToken;
    } while (pageToken);
    return {
      size,
      count
    };
  }

  /**
   * Add a usage marker for a binary
   * @param hash - the binary hash
   * @param uuid - the marker name: `${property}_${uuid}`
   * @param model - the model identifier of the object
   */
  async putMarker(hash: string, uuid: string, model: string) {
    await this.getStorageBucket()
      .file(this._getKey(hash, uuid))
      .save("", {
        metadata: {
          metadata: {
            webdaModel: model
          }
        }
      });
  }

  /**
   * Delete every object under the prefix, used by tests
   */
  async __clean(): Promise<void> {
    const [files] = await this.getStorageBucket().getFiles({ prefix: this.parameters.prefix });
    await Promise.all(files.map(f => f.delete()));
  }
}

export { Storage };
