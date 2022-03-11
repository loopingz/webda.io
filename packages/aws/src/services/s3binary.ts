"use strict";
// Load the AWS SDK for Node.js
import {
  CloudBinary,
  BinaryMap,
  BinaryParameters,
  Context,
  CoreModel,
  Modda,
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
  prefix?: string;
  CloudFormation: any;
  CloudFormationSkip: boolean;

  constructor(params: any, service: S3Binary) {
    super(params, service);
    if (!this.bucket) {
      throw new WebdaError("S3BUCKET_PARAMETER_REQUIRED", "Need to define a bucket at least");
    }
    this.s3ForcePathStyle ??= false;
    this.prefix = "";
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
@Modda
export default class S3Binary<T extends S3BinaryParameters = S3BinaryParameters>
  extends CloudBinary<T>
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
          await this.uploadSuccess(object, property, body);
          return;
        }
      }
      // Need to do something?
    } else {
      await this.putMarker(body.hash, `challenge_${body.challenge}`, "challenge");
    }
    await this.uploadSuccess(object, property, body);
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

  /**
   * @override
   */
  async getSignedUrlFromMap(binaryMap: BinaryMap, expire: number) {
    var params: any = {};
    params.Expires = expire; // A get should not take more than 30s
    params.ResponseContentDisposition = `attachment; filename=${binaryMap.name || binaryMap.originalname}`;
    params.ResponseContentType = binaryMap.mimetype;

    // Access-Control-Allow-Origin
    return this.getSignedUrl(this._getKey(binaryMap.hash), "getObject", params);
  }

  /**
   * @override
   */
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
    await this._s3.deleteObject(params).promise();
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
  async store(object: CoreModel, property: string, file: BinaryFile): Promise<void> {
    this.checkMap(object.getStore().getName(), property);
    await file.getHashes();
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
          Body: await file.get()
        })
        .promise();
    }
    // Set challenge aside for now
    await this.putMarker(file.hash, `challenge_${file.challenge}`, "challenge");

    await this.putMarker(file.hash, object.getUuid(), object.getStore().getName());
    await this.uploadSuccess(object, property, file);
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
}

export { S3Binary };
