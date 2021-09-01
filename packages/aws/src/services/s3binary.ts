"use strict";
// Load the AWS SDK for Node.js
import {
  Binary,
  BinaryMap,
  BinaryParameters,
  Context,
  CoreModel,
  ModdaDefinition,
  EventBinaryGet,
  WebdaError,
  BinaryFile
} from "@webda/core";
import { CloudFormationContributor } from ".";
import CloudFormationDeployer from "../deployers/cloudformation";
import { GetAWS } from "./aws-mixin";
import * as bluebird from "bluebird";
import { Readable } from "stream";

export class S3BinaryParameters extends BinaryParameters {
  endpoint?: string;
  s3ForcePathStyle?: boolean;
  bucket: string;
  CloudFormation: any;
  CloudFormationSkip: boolean;

  constructor(params: any, service: Binary) {
    super(params, service);
    if (!this.bucket) {
      throw new WebdaError("S3BUCKET_PARAMETER_REQUIRED", "Need to define a bucket at least");
    }
    this.s3ForcePathStyle ??= false;
  }
}

/**
 * S3Binary handles the storage of binary on a S3 bucket
 *
 * The structure used for now is
 * /{hash}/data
 * /{hash}/{targetStore}_{uuid}
 * The challenge is stored on the metadata of the data object
 *
 * It takes parameters
 *  bucket: "bucketName"
 *  accessKeyId: ""
 *  secretAccessKey: ""
 *  region: ""
 *
 * See Binary the general interface
 *
 * We can register on S3 Event to get info when /data is pushed
 */
export default class S3Binary<T extends S3BinaryParameters = S3BinaryParameters>
  extends Binary<T>
  implements CloudFormationContributor
{
  AWS: any;
  _s3: AWS.S3;

  /**
   * Load the parameters
   *
   * @param params
   */
  loadParameters(params: any) {
    return new S3BinaryParameters(params, this);
  }

  /**
   * @inheritdoc
   */
  computeParameters() {
    this.AWS = GetAWS(this.parameters);
    this._s3 = new this.AWS.S3({
      endpoint: this.parameters.endpoint,
      s3ForcePathStyle: this.parameters.s3ForcePathStyle
    });
  }

  /**
   * @inheritdoc
   */
  _initRoutes(): boolean {
    if (!super._initRoutes()) {
      return false;
    }
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
            "302": "Redirect to download url",
            "403": "You don't have permissions",
            "404": "Object does not exist or attachment does not exist",
            "412": "Provided hash does not match"
          }
        }
      });
      url = this.parameters.expose.url + "/{store}/{uid}/{property}/{index}/url";
      name = this._name === "Binary" ? "" : this._name;
      this.addRoute(url, ["GET"], this.getRedirectUrlInfo, {
        get: {
          description: "Get a redirect url to binary linked to an object",
          summary: "Get redirect url of a binary",
          operationId: `get${name}BinaryURL`,
          responses: {
            "200": "Containing the URL",
            "403": "You don't have permissions",
            "404": "Object does not exist or attachment does not exist",
            "412": "Provided hash does not match"
          }
        }
      });
    }
  }

  /**
   * @inheritdoc
   */
  async putRedirectUrl(ctx: Context): Promise<{ url: string; method: string }> {
    let body = ctx.getRequestBody();
    let uid = ctx.parameter("uid");
    let store = ctx.parameter("store");
    let property = ctx.parameter("property");
    let targetStore = this._verifyMapAndStore(ctx);
    let object: any = await targetStore.get(uid);
    var base64String = Buffer.from(body.hash, "hex").toString("base64");
    var params = {
      Bucket: this.parameters.bucket,
      Key: this._getKey(body.hash),
      ContentType: "application/octet-stream",
      ContentMD5: base64String
    };
    // List bucket
    let data = await this._s3
      .listObjectsV2({
        Bucket: this.parameters.bucket,
        Prefix: this._getKey(body.hash, "")
      })
      .promise();
    let foundMap = false;
    let foundData = false;
    let challenge;
    for (let i in data.Contents) {
      if (data.Contents[i].Key.endsWith("data")) foundData = true;
      if (data.Contents[i].Key.endsWith(uid)) foundMap = true;
      if (data.Contents[i].Key.split("/").pop().startsWith("challenge_")) {
        challenge = data.Contents[i].Key.split("/").pop().substr("challenge_".length);
      }
    }
    if (foundMap) {
      if (foundData) return;
      return { url: this.getSignedUrl(params.Key, "putObject", params), method: "PUT" };
    }
    if (foundData) {
      if (challenge) {
        // challenge and data prove it exists
        if (challenge === body.challenge) {
          await this.uploadSuccess(object, property, body, body.metadatas);
          return;
        }
      }
      // Need to do something?
    } else {
      await this.putMarker(body.hash, `challenge_${body.challenge}`, "challenge");
    }
    await this.uploadSuccess(object, property, body, body.metadatas);
    await this.putMarker(body.hash, uid, store);
    return { url: this.getSignedUrl(params.Key, "putObject", params), method: "PUT" };
  }

  /**
   * @inheritdoc
   */
  putMarker(hash, uuid, storeName) {
    var s3obj = new this.AWS.S3({
      endpoint: this.parameters.endpoint,
      s3ForcePathStyle: this.parameters.s3ForcePathStyle || false,
      params: {
        Bucket: this.parameters.bucket,
        Key: this._getKey(hash, uuid),
        Metadata: {
          "x-amz-meta-store": storeName
        }
      }
    });
    return s3obj.putObject().promise();
  }

  /**
   * Return a signed url to an object
   *
   * @param key to the object
   * @param action to perform
   * @param params
   * @returns
   */
  getSignedUrl(key: string, action: string = "getObject", params: any = {}): string {
    params.Bucket = params.Bucket || this.parameters.bucket;
    params.Key = key;
    return this._s3.getSignedUrl(action, params);
  }

  async getRedirectUrlFromObject(obj, property, index, context, expire = 30) {
    let info = obj[property][index];
    var params: any = {};
    params.Expires = expire; // A get should not take more than 30s
    await this.emitSync("Binary.Get", <EventBinaryGet>{
      object: info,
      service: this,
      context: context
    });
    params.ResponseContentDisposition = "attachment; filename=" + info.name;
    params.ResponseContentType = info.mimetype;
    // Access-Control-Allow-Origin
    return this.getSignedUrl(this._getKey(info.hash), "getObject", params);
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
        Location: url
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

  async _get(info: BinaryMap): Promise<Readable> {
    return this._s3
      .getObject({
        Bucket: this.parameters.bucket,
        Key: this._getKey(info.hash)
      })
      .createReadStream();
  }

  /**
   * Check if an object exists on S3
   * @param key
   * @param bucket
   */
  async exists(Key: string, Bucket: string = this.parameters.bucket): Promise<AWS.S3.HeadObjectOutput | null> {
    try {
      return await this._s3
        .headObject({
          Bucket,
          Key
        })
        .promise();
    } catch (err) {
      if (err.code === "NotFound") {
        return null;
      }
      throw err;
    }
  }

  /**
   * @inheritdoc
   */
  async getUsageCount(hash: string): Promise<number> {
    // Not efficient if more than 1000 docs
    let data = await this._s3
      .listObjects({
        Bucket: this.parameters.bucket,
        Prefix: this._getKey(hash, "")
      })
      .promise();
    return data.Contents.filter(k => !(k.Key.includes("data") || k.Key.includes("challenge"))).length;
  }

  /**
   * @inheritdoc
   */
  async _cleanHash(hash: string): Promise<void> {
    let files = (
      await this._s3.listObjectsV2({ Bucket: this.parameters.bucket, Prefix: this._getKey(hash, "") }).promise()
    ).Contents;
    await bluebird.map(
      files,
      file => this._s3.deleteObject({ Bucket: this.parameters.bucket, Key: file.Key }).promise(),
      { concurrency: 5 }
    );
  }

  /**
   * @inheritdoc
   */
  async _cleanUsage(hash: string, uuid: string) {
    // Dont clean data for now
    var params = {
      Bucket: this.parameters.bucket,
      Key: this._getKey(hash, uuid)
    };
    return this._s3.deleteObject(params).promise();
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
  async _exists(hash: string): Promise<boolean> {
    try {
      await this._s3.headObject({ Bucket: this.parameters.bucket, Key: this._getKey(hash) }).promise();
      return true;
    } catch (err) {
      if (err.code !== "NotFound") {
        throw err;
      }
    }
    return false;
  }

  /**
   * Return the S3 key
   * @param hash
   * @param postfix
   * @returns
   */
  _getKey(hash: string, postfix: string = undefined): string {
    if (postfix === undefined) {
      return hash + "/data";
    }
    return hash + "/" + postfix;
  }

  /**
   * Get a head object
   * @param hash
   * @returns
   */
  async _getS3(hash: string) {
    return this._s3
      .headObject({
        Bucket: this.parameters.bucket,
        Key: this._getKey(hash)
      })
      .promise()
      .catch(function (err) {
        if (err.code !== "NotFound") {
          return Promise.reject(err);
        }
        return Promise.resolve();
      });
  }

  /**
   * Get an object from s3 bucket
   *
   * @param key to get
   * @param bucket to retrieve from or default bucket
   * @returns
   */
  getObject(key: string, bucket?: string) {
    bucket = bucket || this.parameters.bucket;
    var s3obj = new this.AWS.S3({
      endpoint: this.parameters.endpoint,
      s3ForcePathStyle: this.parameters.s3ForcePathStyle || false,
      params: {
        Bucket: bucket,
        Key: key
      }
    });
    return s3obj.getObject().createReadStream();
  }

  /**
   *
   * @param Bucket to iterate on
   * @param Prefix to use
   * @param callback to execute with each key
   * @param filter regexp to execute on the key
   */
  async forEachFile(
    Bucket: string,
    callback: (Key: string, page: number) => Promise<void>,
    Prefix: string = "",
    filter: RegExp = undefined
  ) {
    let params: any = { Bucket, Prefix };
    let page = 0;
    var s3 = new this.AWS.S3({
      endpoint: this.parameters.endpoint,
      s3ForcePathStyle: this.parameters.s3ForcePathStyle || false
    });
    do {
      await s3
        .listObjectsV2(params)
        .promise()
        .then(async ({ Contents, NextContinuationToken }: any) => {
          params.ContinuationToken = NextContinuationToken;
          for (let f in Contents) {
            let { Key } = Contents[f];
            if (filter && filter.exec(Key) === null) {
              continue;
            }
            await callback(Key, page);
          }
        });
      page++;
    } while (params.ContinuationToken);
  }

  /**
   * Add an object to S3 bucket
   *
   * @param key to add to
   * @param body content of the object
   * @param metadatas to put along the object
   * @param bucket to use
   */
  async putObject(
    key: string,
    body: Buffer | Blob | string | ReadableStream,
    metadatas = {},
    bucket: string = this.parameters.bucket
  ) {
    var s3obj = new this.AWS.S3({
      endpoint: this.parameters.endpoint,
      s3ForcePathStyle: this.parameters.s3ForcePathStyle || false,
      params: {
        Bucket: bucket,
        Key: key,
        Metadata: metadatas
      }
    });
    await s3obj
      .upload({
        Body: body
      })
      .promise();
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
    let data = await this._getS3(file.hash);
    if (data === undefined) {
      let s3metas: any = {};
      s3metas["x-amz-meta-challenge"] = file.challenge;
      var s3obj = new this.AWS.S3({
        endpoint: this.parameters.endpoint,
        s3ForcePathStyle: this.parameters.s3ForcePathStyle || false,
        params: {
          Bucket: this.parameters.bucket,
          Key: this._getKey(file.hash),
          Metadata: s3metas
        }
      });
      await s3obj
        .upload({
          Body: file.buffer
        })
        .promise();
    }
    // Set challenge aside for now
    await this.putMarker(file.hash, `challenge_${file.challenge}`, "challenge");

    await this.putMarker(file.hash, object.getUuid(), object.getStore().getName());
    await this.uploadSuccess(object, property, file, metadatas);
  }

  /**
   * @inheritdoc
   */
  getARNPolicy(accountId) {
    return {
      Sid: this.constructor.name + this._name,
      Effect: "Allow",
      Action: [
        "s3:AbortMultipartUpload",
        "s3:DeleteObject",
        "s3:DeleteObjectVersion",
        "s3:GetObject",
        "s3:GetObjectAcl",
        "s3:GetObjectTagging",
        "s3:GetObjectTorrent",
        "s3:GetObjectVersion",
        "s3:GetObjectVersionAcl",
        "s3:GetObjectVersionTagging",
        "s3:GetObjectVersionTorrent",
        "s3:ListBucket",
        "s3:ListBucketMultipartUploads",
        "s3:ListBucketVersions",
        "s3:ListMultipartUploadParts",
        "s3:PutBucketAcl",
        "s3:PutObject",
        "s3:PutObjectAcl",
        "s3:RestoreObject"
      ],
      Resource: [`arn:aws:s3:::${this.parameters.bucket}`, `arn:aws:s3:::${this.parameters.bucket}/*`]
    };
  }

  /**
   * @inheritdoc
   */
  getCloudFormation(deployer: CloudFormationDeployer) {
    if (this.parameters.CloudFormationSkip) {
      return {};
    }
    let resources = {};
    this.parameters.CloudFormation = this.parameters.CloudFormation || {};
    this.parameters.CloudFormation.Bucket = this.parameters.CloudFormation.Bucket || {};
    resources[this._name + "Bucket"] = {
      Type: "AWS::S3::Bucket",
      Properties: {
        ...this.parameters.CloudFormation.Bucket,
        BucketName: this.parameters.bucket,
        Tags: deployer.getDefaultTags(this.parameters.CloudFormation.Bucket.Tags)
      }
    };
    // Add any Other resources with prefix of the service
    return resources;
  }

  /**
   * @inheritdoc
   */
  static getModda(): ModdaDefinition {
    return {
      uuid: "Webda/S3Binary",
      label: "S3 Binary",
      description:
        "Implements S3 storage, so you can upload binary from users, handles mapping with other objects. It only stores once a binary, and if you use the attached Polymer behavior it will not even uplaod file if they are on the server already",
      documentation: "https://raw.githubusercontent.com/loopingz/webda/master/readmes/Binary.md",
      logo: "images/icons/s3.png"
    };
  }
}

export { S3Binary };
