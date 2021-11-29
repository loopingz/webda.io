"use strict";
import { Storage as GCS, GetSignedUrlConfig } from "@google-cloud/storage";
import {
  Binary,
  BinaryMap,
  BinaryParameters,
  Context,
  CoreModel,
  ModdaDefinition,
  EventBinaryGet,
  WebdaError,
  BinaryFile,
} from "@webda/core";
import { Readable, Stream } from "stream";
import { join } from "path";

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
  endpoint?: string;
  prefix?: string;
  bucket?: string;
  CloudFormation: any;
  CloudFormationSkip: boolean = false;

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
  loadParameters(params: any): StorageParameters {
    return new StorageParameters(params, this);
  }

  /**
   * @inheritdoc
   */
  computeParameters() {
    console.log("compute");
  }

  /**
   * @inheritdoc
   */
  //_initRoutes(): boolean {
  // if (!super._initRoutes()) {
  //   return false;
  // }
  // // Will use getRedirectUrl so override the default route
  // var url = this.parameters.expose.url + "/{store}/{uid}/{property}/{index}";
  // let name = this.getOperationName();
  // if (!this.parameters.expose.restrict.get) {
  //   this.addRoute(url, ["GET"], this.getRedirectUrl, {
  //     get: {
  //       description: "Download a binary linked to an object",
  //       summary: "Download a binary",
  //       operationId: `get${name}Binary`,
  //       responses: {
  //         "302": "Redirect to download url",
  //         "403": "You don't have permissions",
  //         "404": "Object does not exist or attachment does not exist",
  //         "412": "Provided hash does not match"
  //       }
  //     }
  //   });
  //   url = this.parameters.expose.url + "/{store}/{uid}/{property}/{index}/url";
  //   name = this._name === "Binary" ? "" : this._name;
  //   this.addRoute(url, ["GET"], this.getRedirectUrlInfo, {
  //     get: {
  //       description: "Get a redirect url to binary linked to an object",
  //       summary: "Get redirect url of a binary",
  //       operationId: `get${name}BinaryURL`,
  //       responses: {
  //         "200": "Containing the URL",
  //         "403": "You don't have permissions",
  //         "404": "Object does not exist or attachment does not exist",
  //         "412": "Provided hash does not match"
  //       }
  //     }
  //   });
  // }
  //}

  /**
   * Return the S3 key
   * @param hash
   * @param postfix
   * @returns
   */
  _getKey(hash: string, postfix: string | undefined = undefined): string {
    if (postfix === undefined) {
      return join(`${this.parameters.prefix}`, hash, "data");
    }
    return join(`${this.parameters.prefix}`, hash, postfix);
  }

  async _get(info: BinaryMap): Promise<Readable> {
    return this.getContent({ key: this._getKey(info.hash) });
  }

  /**
   * Get object content in Buffer
   * @param {StorageObject} params
   */
  async getContent({ bucket, key }: StorageObject): Promise<Readable> {
    bucket ??= this.parameters.bucket;
    return this.storage.bucket(bucket).file(key).createReadStream();
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
    body: Buffer | string, // @TODO add : | Blob | ReadableStream,
    metadatas = {},
    bucket: string = this.parameters.bucket
    //{ bucket, localPath, content, key }: PutObjectParams
  ): Promise<void> {
    if (body) {
      const file = await this.storage.bucket(bucket).file(key);
      const bufferStream = new Stream.PassThrough();
      bufferStream.end(body);
      await bufferStream.pipe(file.createWriteStream());
      if (metadatas) {
        await file.setMetadata({ metadata: metadatas });
      }
      this._webda.log("DEBUG", `${body.length} octets uploaded to ${bucket}/${key}`);
      // @TODO: use this code to be able to upload local file
      // } else if (localPath) {
      //   await this.storage.bucket(bucket).upload(localPath, { destination: key });
      //   this._webda.log("DEBUG",`${localPath} uploaded to ${bucket}/${key}`);
    } else {
      throw new Error(`you need to define 'localPath' OR 'body' parameter`);
    }
  }

  /**
   * @inheritdoc
   */
  async delete(object: CoreModel, property: string, index: number) {
    // let hash = object[property][index].hash;
    // await this.deleteSuccess(object, property, index);
    // await this._cleanUsage(hash, object.getUuid());
  }

  /**
   * @inheritdoc
   */
  async cascadeDelete(info: BinaryMap, uuid: string): Promise<void> {
    // try {
    //   await this._cleanUsage(info.hash, uuid);
    // } catch (err) {
    //   this._webda.log("WARN", "Cascade delete failed", err);
    // }
  }

  /**
   * @inheritdoc
   */
  async getUsageCount(hash: string): Promise<number> {
    // Not efficient if more than 1000 docs
    // let data = await this._s3
    //   .listObjects({
    //     Bucket: this.parameters.bucket,
    //     Prefix: this._getKey(hash, "")
    //   })
    //   .promise();
    // return data.Contents.filter(k => !(k.Key.includes("data") || k.Key.includes("challenge"))).length;
    return -1;
  }

  /**
   * @inheritdoc
   */
  async store(
    object: CoreModel,
    property: string,
    file: BinaryFile,
    metadatas?: { [key: string]: any }
  ): Promise<void> {
    this._checkMap(object.getStore().getName(), property);
    this._prepareInput(file);
    if (!file.hash) {
      throw new Error(`gcp::storage::store() failure missing hash after _prepareInput()`);
    }
    if (!file.buffer) {
      throw new Error(`gcp::storage::store() failure missing buffer after _prepareInput()`);
    }

    let data = await this.getContent({ key: file.hash });
    if (data === undefined) {
      let metadata: any = {};
      metadata["x-amz-meta-challenge"] = file.challenge;
      var obj = this.putObject(this._getKey(file.hash), file.buffer, metadata);
    }
    // Set challenge aside for now
    await this.putMarker(file.hash, `challenge_${file.challenge}`, "challenge");

    await this.putMarker(file.hash, object.getUuid(), object.getStore().getName());
    await this.uploadSuccess(object, property, file, metadatas);
  }

  /**
   * Delete a file inside an existing bucket
   * @param {DeleteObjectParams} params
   */
  async deleteObject({ bucket, key }: StorageObject): Promise<void> {
    bucket ??= this.parameters.bucket;
    await this.storage.bucket(bucket).file(key).delete();
    this._webda.log("DEBUG", `gs://${bucket}/${key} deleted`);
  }

  /**
   * Move a file from one bucket to an other
   * @param {StorageObject} source
   * @param {StorageObject} destination
   */
  async moveObject(source: StorageObject, destination: StorageObject): Promise<void> {
    const newFile = this.storage.bucket(destination.bucket || this.parameters.bucket).file(destination.key);
    this._webda.log(
      "DEBUG",
      `moveObject gs://${source.bucket}/${source.key} => gs://${destination.bucket}/${destination.key}`
    );
    await this.storage
      .bucket(source.bucket || this.parameters.bucket)
      .file(source.key)
      .move(newFile);
  }

  /**
   * Configure Bucket CORS options
   * @param {any} options
   */
  async configureBucketCors(bucket: string, options: any[]): Promise<void> {
    await this.storage.bucket(bucket).setCorsConfiguration(options);
  }

  /**
   * Retrieve one signed URL to download the file in parameter
   * @param {GetSignedUrlParams} params
   * @returns {string} URL in order to download the file
   */
  async getSignedUrl({ bucket, key, action, expires = 3600 }: GetSignedUrlParams): Promise<string> {
    bucket ??= this.parameters.bucket;
    const options: GetSignedUrlConfig = {
      version: "v4",
      action,
      expires: Date.now() + expires * 1000,
    };
    const [url] = await this.storage.bucket(bucket).file(key).getSignedUrl(options);
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
    bucket ??= this.parameters.bucket;
    let url: string = this.storage.bucket(bucket).file(key).publicUrl();
    return url;
  }

  /**
   * Fetch an object's metadata
   * @param {StorageModel} store
   * @returns {any} Metadata
   */
  async getMeta({ bucket, key }: StorageObject): Promise<StorageObjectMeta> {
    bucket ??= this.parameters.bucket;
    const [metadata] = await this.storage.bucket(bucket).file(key).getMetadata();
    return {
      size: metadata.size,
      contentType: metadata.contentType,
    };
  }

  /**
   * @inheritdoc
   */
  putMarker(hash: string, uuid: string, storeName: string) {
    // var s3obj = new GCS({
    //   endpoint: this.parameters.endpoint,
    //   params: {
    //     Bucket: this.parameters.bucket,
    //     Key: this._getKey(hash, uuid),
    //     Metadata: {
    //       "x-amz-meta-store": storeName
    //     }
    //   }
    // });
    // return s3obj.putObject().promise();
  }

  /******** S3 EXAMPLES BELOW ******/

  // /**
  //  * @inheritdoc
  //  */
  // async putRedirectUrl(ctx: Context): Promise<{ url: string; method: string }> {
  //   // let body = ctx.getRequestBody();
  //   // let uid = ctx.parameter("uid");
  //   // let store = ctx.parameter("store");
  //   // let property = ctx.parameter("property");
  //   // let targetStore = this._verifyMapAndStore(ctx);
  //   // let object: any = await targetStore.get(uid);
  //   // var base64String = Buffer.from(body.hash, "hex").toString("base64");
  //   // var params = {
  //   //   Bucket: this.parameters.bucket,
  //   //   Key: this._getKey(body.hash),
  //   //   ContentType: "application/octet-stream",
  //   //   ContentMD5: base64String
  //   // };
  //   // // List bucket
  //   // let data = await this._s3
  //   //   .listObjectsV2({
  //   //     Bucket: this.parameters.bucket,
  //   //     Prefix: this._getKey(body.hash, "")
  //   //   })
  //   //   .promise();
  //   // let foundMap = false;
  //   // let foundData = false;
  //   // let challenge;
  //   // for (let i in data.Contents) {
  //   //   if (data.Contents[i].Key.endsWith("data")) foundData = true;
  //   //   if (data.Contents[i].Key.endsWith(uid)) foundMap = true;
  //   //   if (data.Contents[i].Key.split("/").pop().startsWith("challenge_")) {
  //   //     challenge = data.Contents[i].Key.split("/").pop().substr("challenge_".length);
  //   //   }
  //   // }
  //   // if (foundMap) {
  //   //   if (foundData) return;
  //   //   return { url: this.getSignedUrl(params.Key, "putObject", params), method: "PUT" };
  //   // }
  //   // if (foundData) {
  //   //   if (challenge) {
  //   //     // challenge and data prove it exists
  //   //     if (challenge === body.challenge) {
  //   //       await this.uploadSuccess(object, property, body, body.metadatas);
  //   //       return;
  //   //     }
  //   //   }
  //   //   // Need to do something?
  //   // } else {
  //   //   await this.putMarker(body.hash, `challenge_${body.challenge}`, "challenge");
  //   // }
  //   // await this.uploadSuccess(object, property, body, body.metadatas);
  //   // await this.putMarker(body.hash, uid, store);
  //   // return { url: this.getSignedUrl(params.Key, "putObject", params), method: "PUT" };
  // }

  // async getRedirectUrlFromObject(obj, property, index, context, expire = 30) {
  //   // let info = obj[property][index];
  //   // var params: any = {};
  //   // params.Expires = expire; // A get should not take more than 30s
  //   // await this.emitSync("Binary.Get", <EventBinaryGet>{
  //   //   object: info,
  //   //   service: this,
  //   //   context: context
  //   // });
  //   // params.ResponseContentDisposition = "attachment; filename=" + info.name;
  //   // params.ResponseContentType = info.mimetype;
  //   // // Access-Control-Allow-Origin
  //   // return this.getSignedUrl(this._getKey(info.hash), "getObject", params);
  // }

  // /**
  //  * Redirect to the temporary link to S3 object
  //  * or return it if returnInfo=true
  //  *
  //  * @param ctx of the request
  //  * @param returnInfo
  //  */
  // async getRedirectUrl(ctx, returnInfo: boolean = false) {
  //   // let uid = ctx.parameter("uid");
  //   // let index = ctx.parameter("index");
  //   // let property = ctx.parameter("property");
  //   // let targetStore = this._verifyMapAndStore(ctx);
  //   // let object = await targetStore.get(uid);
  //   // if (!object || !Array.isArray(object[property]) || object[property].length <= index) {
  //   //   throw 404;
  //   // }
  //   // await object.canAct(ctx, "get_binary");
  //   // let url = await this.getRedirectUrlFromObject(object, property, index, ctx);
  //   // if (returnInfo) {
  //   //   ctx.write({ Location: url });
  //   // } else {
  //   //   ctx.writeHead(302, {
  //   //     Location: url
  //   //   });
  //   // }
  // }

  // /**
  //  * Return the temporary link to S3 object
  //  * @param ctx
  //  * @returns
  //  */
  // async getRedirectUrlInfo(ctx) {
  //   //return this.getRedirectUrl(ctx, true);
  // }

  // /**
  //  * Check if an object exists on S3
  //  * @param key
  //  * @param bucket
  //  */
  // async exists(Key: string, Bucket: string = this.parameters.bucket): Promise<AWS.S3.HeadObjectOutput | null> {
  //   // try {
  //   //   return await this._s3
  //   //     .headObject({
  //   //       Bucket,
  //   //       Key
  //   //     })
  //   //     .promise();
  //   // } catch (err) {
  //   //   if (err.code === "NotFound") {
  //   //     return null;
  //   //   }
  //   //   throw err;
  //   // }
  // }

  // /**
  //  * @inheritdoc
  //  */
  // async _cleanHash(hash: string): Promise<void> {
  //   // let files = (
  //   //   await this._s3.listObjectsV2({ Bucket: this.parameters.bucket, Prefix: this._getKey(hash, "") }).promise()
  //   // ).Contents;
  //   // await bluebird.map(
  //   //   files,
  //   //   file => this._s3.deleteObject({ Bucket: this.parameters.bucket, Key: file.Key }).promise(),
  //   //   { concurrency: 5 }
  //   // );
  // }

  // /**
  //  * @inheritdoc
  //  */
  // async _cleanUsage(hash: string, uuid: string) {
  //   // // Dont clean data for now
  //   // var params = {
  //   //   Bucket: this.parameters.bucket,
  //   //   Key: this._getKey(hash, uuid)
  //   // };
  //   // return this._s3.deleteObject(params).promise();
  // }

  // /**
  //  * @inheritdoc
  //  */
  // async _exists(hash: string): Promise<boolean> {
  //   // try {
  //   //   await this._s3.headObject({ Bucket: this.parameters.bucket, Key: this._getKey(hash) }).promise();
  //   //   return true;
  //   // } catch (err) {
  //   //   if (err.code !== "NotFound") {
  //   //     throw err;
  //   //   }
  //   // }
  //   // return false;
  // }

  // /**
  //  * Get a head object
  //  * @param hash
  //  * @returns
  //  */
  // async _getS3(hash: string) {
  //   // return this._s3
  //   //   .headObject({
  //   //     Bucket: this.parameters.bucket,
  //   //     Key: this._getKey(hash)
  //   //   })
  //   //   .promise()
  //   //   .catch(function (err) {
  //   //     if (err.code !== "NotFound") {
  //   //       return Promise.reject(err);
  //   //     }
  //   //     return Promise.resolve();
  //   //   });
  // }

  // /**
  //  * Get an object from s3 bucket
  //  *
  //  * @param key to get
  //  * @param bucket to retrieve from or default bucket
  //  * @returns
  //  */
  // getObject(key: string, bucket?: string) {
  //   // bucket = bucket || this.parameters.bucket;
  //   // var s3obj = new this.AWS.S3({
  //   //   endpoint: this.parameters.endpoint,
  //   //   s3ForcePathStyle: this.parameters.s3ForcePathStyle || false,
  //   //   params: {
  //   //     Bucket: bucket,
  //   //     Key: key
  //   //   }
  //   // });
  //   // return s3obj.getObject().createReadStream();
  // }

  // /**
  //  *
  //  * @param Bucket to iterate on
  //  * @param Prefix to use
  //  * @param callback to execute with each key
  //  * @param filter regexp to execute on the key
  //  */
  // async forEachFile(
  //   Bucket: string,
  //   callback: (Key: string, page: number) => Promise<void>,
  //   Prefix: string = "",
  //   filter: RegExp = undefined
  // ) {
  //   // let params: any = { Bucket, Prefix };
  //   // let page = 0;
  //   // var s3 = new this.AWS.S3({
  //   //   endpoint: this.parameters.endpoint,
  //   //   s3ForcePathStyle: this.parameters.s3ForcePathStyle || false
  //   // });
  //   // do {
  //   //   await s3
  //   //     .listObjectsV2(params)
  //   //     .promise()
  //   //     .then(async ({ Contents, NextContinuationToken }: any) => {
  //   //       params.ContinuationToken = NextContinuationToken;
  //   //       for (let f in Contents) {
  //   //         let { Key } = Contents[f];
  //   //         if (filter && filter.exec(Key) === null) {
  //   //           continue;
  //   //         }
  //   //         await callback(Key, page);
  //   //       }
  //   //     });
  //   //   page++;
  //   // } while (params.ContinuationToken);
  // }

  // // /**
  // //  * Add an object to S3 bucket
  // //  *
  // //  * @param key to add to
  // //  * @param body content of the object
  // //  * @param metadatas to put along the object
  // //  * @param bucket to use
  // //  */
  // // async putObject(
  // //   key: string,
  // //   body: Buffer | Blob | string | ReadableStream,
  // //   metadatas = {},
  // //   bucket: string = this.parameters.bucket
  // // ) {
  // //   // var s3obj = new this.AWS.S3({
  // //   //   endpoint: this.parameters.endpoint,
  // //   //   s3ForcePathStyle: this.parameters.s3ForcePathStyle || false,
  // //   //   params: {
  // //   //     Bucket: bucket,
  // //   //     Key: key,
  // //   //     Metadata: metadatas
  // //   //   }
  // //   // });
  // //   // await s3obj
  // //   //   .upload({
  // //   //     Body: body
  // //   //   })
  // //   //   .promise();
  // // }

  // /**
  //  * @inheritdoc
  //  */
  // static getModda(): ModdaDefinition {
  //   // return {
  //   //   uuid: "Webda/Storage",
  //   //   label: "S3 Binary",
  //   //   description:
  //   //     "Implements S3 storage, so you can upload binary from users, handles mapping with other objects. It only stores once a binary, and if you use the attached Polymer behavior it will not even uplaod file if they are on the server already",
  //   //   documentation: "https://raw.githubusercontent.com/loopingz/webda/master/readmes/Binary.md",
  //   //   logo: "images/icons/s3.png"
  //   // };
  // }
}

export { Storage };
