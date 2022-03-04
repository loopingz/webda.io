"use strict";
import { Storage as GCS, GetSignedUrlConfig, Bucket } from "@google-cloud/storage";
import { Binary, BinaryMap, BinaryParameters, CoreModel, BinaryFile, DeepPartial } from "@webda/core";
import { Readable, Stream } from "stream";
import { join } from "path";
import { createReadStream } from "fs";
import * as mime from "mime-types";

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

  constructor(params: any, service: Binary) {
    super(params, service);
    this.prefix = "";
  }
}

/**
 * Storage handles the storage of binary on a Google Cloud Storage bucket
 *
 * See Binary the general interface
 */
export default class Storage<T extends StorageParameters = StorageParameters> extends Binary<T> {
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
   * @inheritdoc
   */
  _initRoutes(): boolean {
    super._initRoutes();
    // Will use getRedirectUrl so override the default route
    var url = this.parameters.expose.url + "/{store}/{uid}/{property}/{index}";
    let name = this.getOperationName();
    if (!this.parameters.expose.restrict.get) {
      this.addRoute(url, ["GET"], this.getRedirectUrl, {
        get: {
          description: "Download a binary linked to an object",
          summary: "Download a binary",
          operationId: `get${name}Binary`,
          responses: {
            "302": {
              description: "Redirect to download url",
            },
            "403": {
              description: "You don't have permissions",
            },
            "404": {
              description: "Object does not exist or attachment does not exist",
            },
            "412": {
              description: "Provided hash does not match",
            },
          },
        },
      });
      url = this.parameters.expose.url + "/{store}/{uid}/{property}/{index}/url";
      name = this._name === "Binary" ? "" : this._name;
      this.addRoute(url, ["GET"], this.getRedirectUrlInfo, {
        get: {
          description: "Get a redirect url to binary linked to an object",
          summary: "Get redirect url of a binary",
          operationId: `get${name}BinaryURL`,
          responses: {
            "200": {
              description: "Containing the URL",
            },
            "403": {
              description: "You don't have permissions",
            },
            "404": {
              description: "Object does not exist or attachment does not exist",
            },
            "412": {
              description: "Provided hash does not match",
            },
          },
        },
      });
    }
    return true;
  }

  /**
   * Redirect to the temporary link to S3 object
   * or return it if returnInfo=true
   *
   * @param ctx of the request
   * @param returnInfo
   */
  async getRedirectUrl(ctx, returnInfo: boolean = false) {
    let uid = ctx.parameter("uid");
    let index = ctx.parameter("index");
    let property = ctx.parameter("property");
    let targetStore = this._verifyMapAndStore(ctx);
    let object = await targetStore.get(uid);
    if (!object || !Array.isArray(object[property]) || object[property].length <= index) {
      throw 404;
    }
    await object.canAct(ctx, "get_binary");
    let url = await this.getRedirectUrlFromObject(object, property, index, ctx);
    if (returnInfo) {
      ctx.write({ Location: url });
    } else {
      ctx.writeHead(302, {
        Location: url,
      });
    }
  }

  /**
   * Return the temporary link to S3 object
   * @param ctx
   * @returns
   */
  async getRedirectUrlInfo(ctx) {
    return this.getRedirectUrl(ctx, true);
  }

  /**
   * Get a UrlFromObject
   *
   */
  async getRedirectUrlFromObject(obj, property, index, context, expires = 30) {
    const info = obj[property][index];
    await this.emitSync("Binary.Get", {
      object: info,
      service: this,
      context: context,
    });
    return this.getSignedUrl({ key: this._getKey(info.hash), expires, action: "read" });
  }

  /**
   * Return the S3 key
   * @param hash
   * @param postfix
   * @returns
   */
  _getKey(hash: string, postfix: string = "data"): string {
    return join(`${this.parameters.prefix}`, hash, postfix);
  }

  /**
   * @override
   */
  async _get(info: BinaryMap): Promise<Readable> {
    const key = this._getKey(info.hash);
    return this.getContent({ key });
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
  async delete(object: CoreModel, property: string, index: number) {
    let hash = object[property][index].hash;
    await this.deleteSuccess(object, property, index);
    await this._cleanUsage(hash, object.getUuid());
  }

  /**
   * @inheritdoc
   */
  async cascadeDelete(info: BinaryMap, uuid: string): Promise<void> {
    try {
      await this._cleanUsage(info.hash, uuid);
    } catch (err) {
      this._webda.log("WARN", "Cascade delete failed", err);
    }
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

  /**
   * @override
   */
  static getModda() {
    return {
      uuid: "Webda/GoogleCloudStorage",
      label: "GCP Storage",
      description: "Implements Storage stored in GCP",
    };
  }
}

export { Storage };
