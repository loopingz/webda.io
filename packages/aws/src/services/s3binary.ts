// Load the AWS SDK for Node.js
import { CloudBinary, BinaryMap, BinaryParameters, Context, CoreModel, WebdaError, BinaryFile } from "@webda/core";
import { CloudFormationContributor } from ".";
import CloudFormationDeployer from "../deployers/cloudformation";
import { AWSServiceParameters } from "./aws-mixin";
import * as bluebird from "bluebird";
import { Readable } from "stream";
import { S3, HeadObjectCommandOutput, GetObjectCommand, PutObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

export class S3BinaryParameters extends AWSServiceParameters(BinaryParameters) {
  forcePathStyle?: boolean;
  bucket: string;
  prefix?: string;
  CloudFormation: any;
  CloudFormationSkip: boolean;

  constructor(params: any, service: S3Binary) {
    super(params, service);
    if (!this.bucket) {
      throw new WebdaError("S3BUCKET_PARAMETER_REQUIRED", "Need to define a bucket at least");
    }
    this.forcePathStyle ??= false;
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
 *
 * @WebdaModda
 */
export default class S3Binary<T extends S3BinaryParameters = S3BinaryParameters>
  extends CloudBinary<T>
  implements CloudFormationContributor
{
  _s3: S3;

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
    this._s3 = new S3(this.parameters);
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
    let data = await this._s3.listObjectsV2({
      Bucket: this.parameters.bucket,
      Prefix: this._getKey(body.hash, "")
    });
    let foundMap = false;
    let foundData = false;
    let challenge;
    console.log("put redirect url", data);
    for (let i in data.Contents) {
      if (data.Contents[i].Key.endsWith("data")) foundData = true;
      if (data.Contents[i].Key.endsWith(uid)) foundMap = true;
      if (data.Contents[i].Key.split("/").pop().startsWith("challenge_")) {
        challenge = data.Contents[i].Key.split("/").pop().substr("challenge_".length);
      }
    }
    if (foundMap) {
      if (foundData) return;
      return { url: await this.getSignedUrl(params.Key, "putObject", params), method: "PUT" };
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
    return { url: await this.getSignedUrl(params.Key, "putObject", params), method: "PUT" };
  }

  /**
   * @inheritdoc
   */
  putMarker(hash, uuid, storeName) {
    var s3obj = new S3({
      endpoint: this.parameters.endpoint,
      forcePathStyle: this.parameters.forcePathStyle || false
    });
    return s3obj.putObject({
      Bucket: this.parameters.bucket,
      Key: this._getKey(hash, uuid),
      Metadata: {
        "x-amz-meta-store": storeName
      }
    });
  }

  /**
   * Return a signed url to an object
   *
   * @param key to the object
   * @param action to perform
   * @param params
   * @returns
   */
  async getSignedUrl(key: string, action: "getObject" | "putObject" = "getObject", params: any = {}): Promise<string> {
    params.Bucket = params.Bucket || this.parameters.bucket;
    params.Key = key;
    let command;
    if (action === "getObject") {
      command = new GetObjectCommand(params);
    } else if (action === "putObject") {
      command = new PutObjectCommand(params);
    }
    // Create new client as the implementation is an ugly middleware
    return await getSignedUrl(new S3(this.parameters), command, params);
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
    return <Readable>(
      await this._s3.getObject({
        Bucket: this.parameters.bucket,
        Key: this._getKey(info.hash)
      })
    ).Body;
  }

  /**
   * Check if an object exists on S3
   * @param key
   * @param bucket
   */
  async exists(Key: string, Bucket: string = this.parameters.bucket): Promise<HeadObjectCommandOutput | null> {
    try {
      return await this._s3.headObject({
        Bucket,
        Key
      });
    } catch (err) {
      if (err.name === "NotFound") {
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
    let data = await this._s3.listObjects({
      Bucket: this.parameters.bucket,
      Prefix: this._getKey(hash, "")
    });
    return data.Contents.filter(k => !(k.Key.includes("data") || k.Key.includes("challenge"))).length;
  }

  /**
   * @inheritdoc
   */
  async _cleanHash(hash: string): Promise<void> {
    let files = (await this._s3.listObjectsV2({ Bucket: this.parameters.bucket, Prefix: this._getKey(hash, "") }))
      .Contents;
    await bluebird.map(files, file => this._s3.deleteObject({ Bucket: this.parameters.bucket, Key: file.Key }), {
      concurrency: 5
    });
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
    await this._s3.deleteObject(params);
  }

  /**
   * @inheritdoc
   */
  async _exists(hash: string): Promise<boolean> {
    try {
      await this._s3.headObject({ Bucket: this.parameters.bucket, Key: this._getKey(hash) });
      return true;
    } catch (err) {
      if (err.name !== "NotFound") {
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
    try {
      return await this._s3.headObject({
        Bucket: this.parameters.bucket,
        Key: this._getKey(hash)
      });
    } catch (err) {
      if (err.name !== "NotFound") {
        throw err;
      }
    }
  }

  /**
   * Get an object from s3 bucket
   *
   * @param key to get
   * @param bucket to retrieve from or default bucket
   * @returns
   */
  async getObject(key: string, bucket?: string): Promise<Readable> {
    bucket = bucket || this.parameters.bucket;
    var s3obj = new S3({
      endpoint: this.parameters.endpoint,
      forcePathStyle: this.parameters.forcePathStyle || false
    });
    return (
      await s3obj.getObject({
        Bucket: bucket,
        Key: key
      })
    ).Body as Readable;
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
    var s3 = new S3({
      endpoint: this.parameters.endpoint,
      forcePathStyle: this.parameters.forcePathStyle || false
    });
    do {
      await s3.listObjectsV2(params).then(async ({ Contents, NextContinuationToken }: any) => {
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
    var s3obj = new S3({
      endpoint: this.parameters.endpoint,
      forcePathStyle: this.parameters.forcePathStyle || false
    });
    await s3obj.putObject({
      Bucket: bucket,
      Key: key,
      Metadata: metadatas,
      Body: body
    });
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
      var s3obj = new S3({
        endpoint: this.parameters.endpoint,
        forcePathStyle: this.parameters.forcePathStyle || false
      });
      await s3obj.putObject({
        Bucket: this.parameters.bucket,
        Key: this._getKey(file.hash),
        Metadata: s3metas,
        Body: await file.get()
      });
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
