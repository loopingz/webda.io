"use strict";
import { Bucket, File, Storage as GCS, GetSignedUrlConfig } from "@google-cloud/storage";
import {
  BinaryFile,
  BinaryMap,
  BinaryParameters,
  CloudBinary,
  CoreModel,
  DeepPartial,
  OperationContext,
  WebContext
} from "@webda/core";
import { createReadStream } from "fs";
import * as mime from "mime-types";
import { Readable, Stream } from "stream";

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

export class StorageParameters extends BinaryParameters {
  prefix?: string;
  bucket: string;

  constructor(params: any, service: Storage) {
    super(params, service);
    this.prefix = "";
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
  private get storage(): GCS {
    if (!this._storage) {
      this._storage = new GCS();
    }
    return this._storage;
  }

  /**
   * Load the parameters
   *
   * @param params
   */
  loadParameters(params: DeepPartial<T>): StorageParameters {
    return new StorageParameters(params, this);
  }

  /**
   * @override
   */
  async _get(info: BinaryMap): Promise<Readable> {
    const key = this._getKey(info.hash);
    return this.getContent({ key });
  }

  /**
   * @override
   */
  getSignedUrlFromMap(map: BinaryMap, expires: number, _context: OperationContext): Promise<string> {
    return this.getSignedUrl({
      key: this._getKey(map.hash),
      expires,
      action: "read"
    });
  }

  /**
   * Get object content in Buffer
   * @param {StorageObject} params
   */
  async getContent({ bucket, key }: StorageObject): Promise<Readable> {
    return this.getStorageBucket(bucket).file(key).createReadStream();
  }

  /**
   * Upload a local file to GCS bucket destination
   *
   * @param key to add to
   * @param body content of the object
   * @param metadatas to put along the object
   * @param bucket to use
   */
  async putObject(
    key: string,
    body: Readable | Buffer | string,
    metadata = {},
    bucket: string = this.parameters.bucket
    //{ bucket, localPath, content, key }: PutObjectParams
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
    // NODE16-REFACTOR: const { pipeline } = require('stream/promises');
    await new Promise((resolve, reject) => {
      stream
        .pipe(
          file.createWriteStream({
            contentType
          })
        )
        .on("error", reject)
        .on("finish", resolve);
    });
    // Save metadata now
    if (metadata) {
      await file.setMetadata({ metadata: metadata });
    }
  }

  /**
   * Return the Google Bucket directly
   *
   * @param bucket name of the bucket default to the one predefined
   * @returns
   */
  getStorageBucket(bucket: string = this.parameters.bucket): Bucket {
    return this.storage.bucket(bucket);
  }

  /**
   * @inheritdoc
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
   */
  async getUsageCount(hash: string): Promise<number> {
    const [files] = await this.getStorageBucket().getFiles({
      prefix: this._getKey(hash, "")
    });
    return files.filter(n => !n.name.endsWith("/data")).length;
  }

  /**
   * @inheritdoc
   */
  async store(object: CoreModel, property: string, file: BinaryFile): Promise<void> {
    this.checkMap(object, property);
    await file.getHashes();

    const [exists] = await this.getStorageBucket().file(this._getKey(file.hash)).exists();
    // If data already exist no need to upload
    if (!exists) {
      await this.putObject(this._getKey(file.hash), await file.get(), {
        ...file.metadata,
        challenge: file.challenge
      });
    }
    await this.putMarker(file.hash, `${property}_${object.getUuid()}`, object.getStore().getName());
    await this.uploadSuccess(<any>object, property, file);
  }

  /**
   * Delete a file inside an existing bucket
   * @param {DeleteObjectParams} params
   */
  async deleteObject({ bucket, key }: StorageObject): Promise<void> {
    await this.getStorageBucket(bucket).file(key).delete();
    this._webda.log("DEBUG", `gs://${bucket}/${key} deleted`);
  }

  /**
   * Move a file from one bucket to an other
   * @param {StorageObject} source
   * @param {StorageObject} destination
   */
  async moveObject(source: StorageObject, destination: StorageObject): Promise<void> {
    const newFile = this.getStorageBucket(destination.bucket).file(destination.key);
    this._webda.log(
      "DEBUG",
      `moveObject gs://${source.bucket}/${source.key} => gs://${destination.bucket}/${destination.key}`
    );
    await this.getStorageBucket(source.bucket).file(source.key).move(newFile);
  }

  /**
   * @inheritdoc
   */
  async putRedirectUrl(ctx: WebContext): Promise<{ url: string; method: string; headers: { [key: string]: string } }> {
    let body = await ctx.getRequestBody();
    const { uuid, store, property } = ctx.getParameters();
    let targetStore = this._verifyMapAndStore(ctx);
    let object: any = await targetStore.get(uuid);
    let base64String = Buffer.from(body.hash, "hex").toString("base64");
    let params: SignedUrlParams = {
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
      let res = await this.getStorageBucket().file(params.key).getMetadata();
      challenge = res[0].metadata.challenge;
    } catch (err) {
      // Ignore error
    }
    await this.uploadSuccess(object, property, body);
    await this.putMarker(body.hash, `${property}_${uuid}`, store);
    // If the challenge is the same, no need to upload
    if (challenge && challenge === body.challenge) {
      return;
    }
    let url = await this.getSignedUrl(params);
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
   * @param {SignedUrlParams} params
   * @returns {string} URL in order to download the file
   */
  async getSignedUrl({ bucket, key, expires = 3600, action = "read", ...params }: SignedUrlParams): Promise<string> {
    const options: GetSignedUrlConfig = {
      version: "v4",
      action,
      ...params,
      expires: Date.now() + expires * 1000
    };
    const [url] = await this.getStorageBucket(bucket).file(key).getSignedUrl(options);
    this._webda.log("TRACE", `The signed url for ${bucket}/${key} is ${url}.`);
    return url;
  }

  /**
   * Retrieve mandatory headers if needed by the cloud provider (ie. Azure)
   * Returns empty object if no headers are mandatory
   * @returns {[key:string]: string} mandatory headers
   */
  getSignedUrlHeaders(): { [key: string]: string } {
    return {};
  }

  /**
   * Retrieve public URL of this object
   * @param {StorageModel} store
   * @returns {string} Public URL in order to download the file
   */
  async getPublicUrl({ bucket, key }: StorageObject): Promise<string> {
    return this.getStorageBucket(bucket).file(key).publicUrl();
  }

  /**
   * Fetch an object's metadata
   * @param {StorageModel} store
   * @returns {any} Metadata
   */
  async getMeta({ bucket, key }: StorageObject): Promise<StorageObjectMeta> {
    const [metadata] = await this.getStorageBucket(bucket).file(key).getMetadata();
    return {
      size: typeof metadata.size === "string" ? parseInt(metadata.size) : metadata.size,
      contentType: metadata.contentType
    };
  }

  /**
   * @inheritdoc
   */
  async putMarker(hash: string, uuid: string, storeName: string) {
    await this.getStorageBucket()
      .file(this._getKey(hash, uuid))
      .save("", {
        metadata: {
          webdaStore: storeName
        }
      });
  }
}

export { Storage };
