import { Bucket, File, Storage as GCS, GetSignedUrlConfig, StorageOptions } from "@google-cloud/storage";
import {
  BinaryFile,
  BinaryFileInfo,
  BinaryMap,
  CloudBinary,
  CloudBinaryParameters,
  ContentBody,
  ContentCredentialNotFoundError,
  ContentExistsError,
  ContentGetOptions,
  ContentInfo,
  ContentNotFoundError,
  ContentPutOptions,
  CoreModel,
  lookupMimeType,
  OperationContext,
  parseContentUrl,
  SecretString,
  toReadable,
  useModelId
} from "@webda/core";
import { StorageFinder, Throttler } from "@webda/utils";
import { createReadStream } from "fs";
import * as mime from "mime-types";
import { Readable, Stream, Writable } from "node:stream";
import { WebdaError } from "@webda/core";
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
  bucket!: string;
  /**
   * Specify endpoint for GCS
   */
  endpoint?: string;
  /** Default service account credentials, otherwise application default credentials are used. */
  credentials?: StorageOptions["credentials"];
  /** Path to the default service account key file. */
  keyFilename?: string;
  /** Project used with the default credentials. */
  projectId?: string;
  /** Named credentials selectable through `?credential=<name>` in content URLs. */
  credentialProfiles?: Record<string, Pick<StorageOptions, "credentials" | "keyFilename" | "projectId">>;
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
   * @param path - the gs:// or gcs:// url
   * @returns the bucket and key
   */
  getInfo(path: string): { bucket: string; key: string } {
    const { scheme, bucket, key } = parseContentUrl(path);
    if ((scheme !== "gs" && scheme !== "gcs") || !bucket) {
      throw new Error("Invalid protocol path should be gs://bucket/key");
    }
    return {
      bucket,
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
    let pageToken: string | undefined;
    do {
      const query = pageToken ? { prefix: key, pageToken } : { prefix: key };
      const res = await this._storage.bucket(bucket).getFiles(query);
      for (const file of res[0]) {
        processor(`${path}${file.name}`);
      }
      pageToken = res[1]?.pageToken;
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
    const res: string[] = [];
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
  readonly schemes = ["gs", "gcs"];
  private _storage?: GCS;
  private contentClients = new Map<string, GCS>();

  /**
   * Release URL-selected clients when the service stops.
   */
  async stop(): Promise<void> {
    this.contentClients.clear();
    await super.stop();
  }
  /**
   * GCS client, created on first use
   * @returns the GCS client
   */
  private get storage(): GCS {
    if (!this._storage) {
      this._storage = new GCS({
        apiEndpoint: this.parameters.endpoint,
        credentials: SecretString.unwrap(this.parameters.credentials),
        keyFilename: this.parameters.keyFilename,
        projectId: this.parameters.projectId
      });
    }
    return this._storage;
  }

  /**
   * @override
   * @param info - the binary map
   * @returns the content stream
   */
  async _get(info: BinaryMap): Promise<Readable> {
    if (!info.hash) throw new WebdaError.BadRequest("Binary map has no hash");
    return this.getContent(this.getContentUrl(this._getKey(info.hash)));
  }

  /**
   * @override
   * @param map - the binary map
   * @param expires - expiration in seconds
   * @param _context - the operation context
   * @returns the signed url
   */
  getSignedUrlFromMap(map: BinaryMap, expires: number, _context: OperationContext): Promise<string> {
    if (!map.hash) throw new WebdaError.BadRequest("Binary map has no hash");
    return this.getSignedUrl({
      key: this._getKey(map.hash),
      expires,
      action: "read"
    });
  }

  /**
   * Get content read stream from GCS
   * @param urlOrObject - gs:// or gcs:// URL or legacy StorageObject
   * @param options - range options
   * @returns Readable stream
   */
  async getContent(urlOrObject: string | StorageObject, options?: ContentGetOptions): Promise<Readable> {
    let targetBucket: string;
    let targetKey: string;
    let url: string;
    let selectedEndpoint: string | undefined;
    let selectedCredential: string | undefined;
    if (typeof urlOrObject === "string") {
      url = urlOrObject;
      const { bucket, key, endpoint, credential } = parseContentUrl(urlOrObject, this.parameters.bucket);
      targetBucket = bucket!;
      targetKey = key;
      selectedEndpoint = endpoint;
      selectedCredential = credential;
    } else {
      targetBucket = urlOrObject.bucket || this.parameters.bucket;
      targetKey = urlOrObject.key;
      url = `gs://${targetBucket}/${targetKey}`;
    }

    const file = this.getStorageBucket(targetBucket, selectedEndpoint, selectedCredential).file(targetKey);
    const [exists] = await file.exists();
    if (!exists) {
      throw new ContentNotFoundError(`Content not found: ${url}`);
    }

    const streamOpts: any = {};
    if (options?.range) {
      streamOpts.start = options.range.start;
      if (options.range.end !== undefined) {
        streamOpts.end = options.range.end;
      }
    }
    if (this.metrics && (this.metrics as any).download) {
      (this.metrics as any).download.inc();
    }
    return file.createReadStream(streamOpts);
  }

  /**
   * Put content to GCS
   * @param url - gs:// or gcs:// URL
   * @param body - Readable stream, Buffer, or string
   * @param options - write options
   * @returns ContentInfo
   */
  async putContent(url: string, body: ContentBody, options?: ContentPutOptions): Promise<ContentInfo> {
    const { bucket, key, endpoint, credential } = parseContentUrl(url, this.parameters.bucket);
    const targetBucket = bucket!;
    const file = this.getStorageBucket(targetBucket, endpoint, credential).file(key);

    if (options?.ifNotExists) {
      const [exists] = await file.exists();
      if (exists) {
        throw new ContentExistsError(`Content already exists: ${url}`);
      }
    }

    const contentType = options?.contentType || lookupMimeType(key);
    const readable = toReadable(body);
    const writeOpts: any = {
      contentType,
      resumable: options?.contentLength === undefined || options.contentLength > 8 * 1024 * 1024
    };
    if (options?.metadata) {
      writeOpts.metadata = { metadata: options.metadata };
    }
    if (options?.ifNotExists) {
      writeOpts.preconditionOpts = { ifGenerationMatch: 0 };
    }

    try {
      await pipeline(readable, file.createWriteStream(writeOpts));
      if (this.metrics && (this.metrics as any).upload) {
        (this.metrics as any).upload.inc();
      }
    } catch (err: any) {
      if (err?.code === 412 || err?.name === "PreconditionFailed") {
        throw new ContentExistsError(`Content already exists: ${url}`);
      }
      throw err;
    }

    const [metadata] = await file.getMetadata();
    return {
      url,
      size: Number(metadata.size),
      etag: metadata.etag,
      contentType: metadata.contentType || contentType,
      metadata: (metadata.metadata as Record<string, string>) || options?.metadata,
      lastModified: metadata.updated ? new Date(metadata.updated) : undefined
    };
  }

  /**
   * Head content metadata from GCS
   * @param url - gs:// or gcs:// URL
   * @returns ContentInfo or undefined if not found
   */
  async headContent(url: string): Promise<ContentInfo | undefined> {
    const { bucket, key, endpoint, credential } = parseContentUrl(url, this.parameters.bucket);
    const targetBucket = bucket!;
    const file = this.getStorageBucket(targetBucket, endpoint, credential).file(key);
    try {
      const [metadata] = await file.getMetadata();
      return {
        url,
        size: Number(metadata.size),
        etag: metadata.etag,
        contentType: metadata.contentType,
        metadata: metadata.metadata as Record<string, string>,
        lastModified: metadata.updated ? new Date(metadata.updated) : undefined
      };
    } catch (err: any) {
      if (err?.code === 404 || err?.status === 404 || err?.name === "NotFoundError") {
        return undefined;
      }
      throw err;
    }
  }

  /**
   * Delete content from GCS
   * @param url - gs:// or gcs:// URL
   */
  async deleteContent(url: string): Promise<void> {
    const { bucket, key, endpoint, credential } = parseContentUrl(url, this.parameters.bucket);
    const targetBucket = bucket!;
    try {
      await this.getStorageBucket(targetBucket, endpoint, credential).file(key).delete({ ignoreNotFound: true });
    } catch (err: any) {
      if (err?.code !== 404 && err?.status !== 404) {
        throw err;
      }
    }
  }

  /**
   * Upload a local file to GCS bucket destination
   * @deprecated Use {@link putContent} instead.
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
      const detected = mime.lookup(String(body));
      contentType = typeof detected === "string" ? detected : "application/octet-stream";
      stream = createReadStream(body);
    }
    await pipeline(stream, file.createWriteStream({ contentType, resumable: false }));
    await file.setMetadata({ metadata: metadata });
  }

  /**
   * Return the Google Bucket directly
   *
   * @param bucket - name of the bucket default to the one predefined
   * @param endpoint - optional URL-selected API endpoint
   * @param credential - optional configured credential profile
   * @returns the bucket
   */
  getStorageBucket(bucket: string = this.parameters.bucket, endpoint?: string, credential?: string): Bucket {
    if (!endpoint && !credential) {
      return this.storage.bucket(bucket);
    }
    const cacheKey = JSON.stringify([endpoint, credential]);
    let storage = this.contentClients.get(cacheKey);
    if (!storage) {
      let authOptions: Pick<StorageOptions, "credentials" | "keyFilename" | "projectId"> = {
        credentials: SecretString.unwrap(this.parameters.credentials),
        keyFilename: this.parameters.keyFilename,
        projectId: this.parameters.projectId
      };
      if (credential) {
        if (!Object.prototype.hasOwnProperty.call(this.parameters.credentialProfiles ?? {}, credential)) {
          throw new ContentCredentialNotFoundError(credential);
        }
        authOptions = SecretString.unwrap(this.parameters.credentialProfiles![credential]);
        authOptions.projectId ??= this.parameters.projectId;
      }
      storage = new GCS({ ...authOptions, apiEndpoint: endpoint ?? this.parameters.endpoint });
      // The SDK gives STORAGE_EMULATOR_HOST priority for baseUrl even when
      // apiEndpoint is explicit. A URL-selected endpoint must win for this client.
      if (endpoint) storage.baseUrl = `${endpoint}/storage/v1`;
      this.contentClients.set(cacheKey, storage);
    }
    return storage.bucket(bucket);
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

    const hash = file.hash;
    if (!hash) throw new WebdaError.BadRequest("Binary file has no hash");
    const [exists] = await this.getStorageBucket().file(this._getKey(hash)).exists();
    // If data already exist no need to upload
    if (!exists) {
      const url = this.getContentUrl(this._getKey(hash));
      await this.putContent(url, await file.get(), {
        metadata: {
          ...file.metadata,
          proof: file.challenge!
        },
        contentLength: file.size,
        contentType: file.mimetype
      });
    }
    await this.putMarker(hash, `${property}_${object.getUUID()}`, useModelId(object.constructor)!);
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
  ): Promise<{ url: string; method: string; headers: { [key: string]: string } } | undefined> {
    if (!info && !context) throw new WebdaError.BadRequest("Upload information is required");
    const body = info ?? (await context!.getInput());
    if (!body.hash || !body.challenge) throw new WebdaError.BadRequest("Upload hash and challenge are required");
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
        "x-goog-meta-proof": body.challenge
      }
    };
    // Check whether the data already exists, and the proof its uploader stored with it (`proof` metadata; the
    // legacy `challenge` metadata, whose value every reader of the owner could see, is no proof)
    let exists = false;
    let challenge: string | undefined;
    try {
      const res = await this.getStorageBucket().file(params.key).getMetadata();
      exists = true;
      const stored = res[0].metadata?.proof;
      challenge = stored === undefined || stored === null ? undefined : `${stored}`;
    } catch {
      // The data does not exist yet
    }
    if (exists) {
      // Attaching existing data needs the proof of possession: the matching challenge
      if (challenge !== undefined && challenge === body.challenge) {
        await this.uploadSuccess(<any>object, property, body);
        await this.putMarker(body.hash, `${property}_${uuid}`, useModelId(object.constructor)!);
        return;
      }
      // A hash alone never attaches: the client has to upload the content it claims to hold
    } else {
      // New content: the signed PUT binds the bytes to the announced hash (Content-MD5)
      await this.uploadSuccess(<any>object, property, body);
      await this.putMarker(body.hash, `${property}_${uuid}`, useModelId(object.constructor)!);
    }
    const url = await this.getSignedUrl(params);
    return {
      url,
      method: "PUT",
      headers: {
        "Content-MD5": base64String,
        "Content-Type": "application/octet-stream",
        "x-goog-meta-proof": body.challenge,
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
      size: Number(metadata.size ?? 0),
      contentType: metadata.contentType ?? "application/octet-stream"
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
    let pageToken: string | undefined;
    const throttler = new Throttler();
    bucket ??= this.parameters.bucket;
    let size = 0;
    let count = 0;
    const dwl = (f: File) => {
      return async () => {
        try {
          const metadata = (await f.getMetadata())[0];
          size += Number.parseInt(String(metadata.size ?? "0"));
          count++;
        } catch {
          // Ignore files removed while computing
        }
      };
    };
    do {
      const [files, page] = await this.storage.bucket(bucket!).getFiles({ maxResults: 1000, pageToken, prefix });
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
