"use strict";
import { Bucket, GetSignedUrlConfig, Storage as GCS } from "@google-cloud/storage";
import { BinaryFile, BinaryMap, BinaryParameters, CloudBinary, Context, CoreModel, DeepPartial } from "@webda/core";
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

export type GetSignedUrlParams = StorageObject & {
  expires?: number;
  action: "read" | "write" | "delete";
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
  getSignedUrlFromMap(map: BinaryMap, expires: number, _context: Context): Promise<string> {
    return this.getSignedUrl({ key: this._getKey(map.hash), expires, action: "read" });
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
            contentType,
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
  async _cleanUsage(hash: string, uuid: string) {
    await this.getStorageBucket().file(this._getKey(hash, uuid)).delete();
  }

  /**
   * @inheritdoc
   */
  async getUsageCount(hash: string): Promise<number> {
    const [files] = await this.getStorageBucket().getFiles({
      prefix: this._getKey(hash, ""),
    });
    return files.filter(n => !n.name.endsWith("/data")).length;
  }

  /**
   * @inheritdoc
   */
  async store(object: CoreModel, property: string, file: BinaryFile): Promise<void> {
    this.checkMap(object.getStore().getName(), property);
    await file.getHashes();

    const [exists] = await this.getStorageBucket().file(this._getKey(file.hash)).exists();
    // If data already exist no need to upload
    if (!exists) {
      await this.putObject(this._getKey(file.hash), await file.get(), {
        ...file.metadata,
        challenge: file.challenge,
      });
    }
    await this.putMarker(file.hash, object.getUuid(), object.getStore().getName());
    await this.uploadSuccess(object, property, file);
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
   * Retrieve one signed URL to download the file in parameter
   * @param {GetSignedUrlParams} params
   * @returns {string} URL in order to download the file
   */
  async getSignedUrl({ bucket, key, action, expires = 3600 }: GetSignedUrlParams): Promise<string> {
    const options: GetSignedUrlConfig = {
      version: "v4",
      action,
      expires: Date.now() + expires * 1000,
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
      size: parseInt(metadata.size),
      contentType: metadata.contentType,
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
          webdaStore: storeName,
        },
      });
  }
}

export { Storage };
