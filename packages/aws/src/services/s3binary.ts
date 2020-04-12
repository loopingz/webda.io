"use strict";
// Load the AWS SDK for Node.js
import { Binary, Context, ModdaDefinition, _extend } from "@webda/core";
import { CloudFormationContributor } from ".";
import CloudFormationDeployer from "../deployers/cloudformation";
import { GetAWS } from "./aws-mixin";

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
 */
export default class S3Binary extends Binary implements CloudFormationContributor {
  AWS: any;
  _s3: any;

  /** @ignore */
  constructor(webda, name, params) {
    super(webda, name, params);
    if (params.bucket === undefined) {
      throw new Error("Need to define a bucket at least");
    }
    this.AWS = GetAWS(params);
  }

  async init(): Promise<void> {
    await super.init();
    this._s3 = new this.AWS.S3({
      endpoint: this._params.endpoint,
      s3ForcePathStyle: this._params.s3ForcePathStyle || false,
    });
  }

  _initRoutes(): boolean {
    if (!super._initRoutes()) {
      return false;
    }
    // Will use getRedirectUrl so override the default route
    var url = this._url + "/{store}/{uid}/{property}/{index}";
    let name = this._name === "Binary" ? "" : this._name;
    if (!this._params.expose.restrict.get) {
      this._addRoute(url, ["GET"], this.getRedirectUrl, {
        get: {
          description: "Download a binary linked to an object",
          summary: "Download a binary",
          operationId: `get${name}Binary`,
          responses: {
            "302": "Redirect to download url",
            "403": "You don't have permissions",
            "404": "Object does not exist or attachment does not exist",
            "412": "Provided hash does not match",
          },
        },
      });
      url = this._url + "/{store}/{uid}/{property}/{index}/url";
      name = this._name === "Binary" ? "" : this._name;
      this._addRoute(url, ["GET"], this.getRedirectUrlInfo, {
        get: {
          description: "Get a redirect url to binary linked to an object",
          summary: "Get redirect url of a binary",
          operationId: `get${name}BinaryURL`,
          responses: {
            "200": "Containing the URL",
            "403": "You don't have permissions",
            "404": "Object does not exist or attachment does not exist",
            "412": "Provided hash does not match",
          },
        },
      });
    }
  }

  async putRedirectUrl(ctx: Context): Promise<string> {
    let body = ctx.getRequestBody();
    if (body.hash === undefined) {
      this._webda.log("WARN", "Request not conform", body);
      throw 403;
    }
    let uid = ctx.parameter("uid");
    let store = ctx.parameter("store");
    let property = ctx.parameter("property");
    let targetStore = this._verifyMapAndStore(ctx);
    let object: any = await targetStore.get(uid);
    await object.canAct(ctx, "attach_binary");
    var base64String = new Buffer(body.hash, "hex").toString("base64");
    var params = {
      Bucket: this._params.bucket,
      Key: this._getPath(body.hash),
      ContentType: "application/octet-stream",
      ContentMD5: base64String,
    };
    // List bucket
    let data = this._s3
      .listObjectsV2({
        Bucket: this._params.bucket,
        Prefix: this._getPath(body.hash, ""),
      })
      .promise();
    let foundMap = false;
    let foundData = false;
    for (let i in data.Contents) {
      if (data.Contents[i].Key.endsWith("data")) foundData = true;
      if (data.Contents[i].Key.endsWith(uid)) foundMap = true;
    }
    if (foundMap) {
      if (foundData) return;
      return this.getSignedUrl(params.Key, "putObject", params);
    }
    await this.updateSuccess(targetStore, object, property, "add", body, body.metadatas);
    await this.putMarker(body.hash, uid, store);
    return this.getSignedUrl(params.Key, "putObject", params);
  }

  putMarker(hash, uuid, storeName) {
    var s3obj = new this.AWS.S3({
      endpoint: this._params.endpoint,
      s3ForcePathStyle: this._params.s3ForcePathStyle || false,
      params: {
        Bucket: this._params.bucket,
        Key: this._getPath(hash, uuid),
        Metadata: {
          "x-amz-meta-store": storeName,
        },
      },
    });
    return s3obj.putObject().promise();
  }

  getSignedUrl(key: string, action: string = "getObject", params: any = {}): string {
    params.Bucket = params.Bucket || this._params.bucket;
    params.Key = key;
    return this._s3.getSignedUrl(action, params);
  }

  async getRedirectUrlFromObject(obj, property, index, context, expire = 30) {
    let info = obj[property][index];
    var params: any = {};
    params.Expires = expire; // A get should not take more than 30s
    await this.emitSync("Binary.Get", {
      object: info,
      service: this,
      context: context,
    });
    params.ResponseContentDisposition = "attachment; filename=" + info.name;
    params.ResponseContentType = info.mimetype;
    // Access-Control-Allow-Origin
    return this.getSignedUrl(this._getPath(info.hash), "getObject", params);
  }

  async getRedirectUrl(ctx) {
    let uid = ctx.parameter("uid");
    let index = ctx.parameter("index");
    let property = ctx.parameter("property");
    let targetStore = this._verifyMapAndStore(ctx);
    let obj = await targetStore.get(uid);
    if (obj === undefined || obj[property] === undefined || obj[property][index] === undefined) {
      throw 404;
    }
    await obj.canAct(ctx, "get_binary");
    let url = await this.getRedirectUrlFromObject(obj, property, index, ctx);
    ctx.writeHead(302, {
      Location: url,
    });
    ctx.end();
  }

  async getRedirectUrlInfo(ctx) {
    let uid = ctx.parameter("uid");
    let property = ctx.parameter("property");
    let index = ctx.parameter("index");
    let targetStore = this._verifyMapAndStore(ctx);
    let obj = await targetStore.get(uid);
    if (obj === undefined || obj[property] === undefined || obj[property][index] === undefined) {
      throw 404;
    }
    await obj.canAct(ctx, "get_binary");
    let url = await this.getRedirectUrlFromObject(obj, property, index, ctx);
    ctx.write({ Location: url });
    ctx.end();
  }

  _get(info) {
    return this._s3
      .getObject({
        Bucket: this._params.bucket,
        Key: this._getPath(info.hash),
      })
      .createReadStream();
  }

  async getUsageCount(hash): Promise<number> {
    // Not efficient if more than 1000 docs
    let data = await this._s3
      .listObjects({
        Bucket: this._params.bucket,
        Prefix: this._getPath(hash, ""),
      })
      .promise();
    return data.Contents.length ? data.Contents.length - 1 : 0;
  }

  _cleanHash(hash) {}

  async _cleanUsage(hash, uuid) {
    // Dont clean data for now
    var params = {
      Bucket: this._params.bucket,
      Key: this._getPath(hash, uuid),
    };
    return this._s3.deleteObject(params).promise();
  }

  async delete(targetStore, object, property, index) {
    let hash = object[property][index].hash;
    let update = await this.deleteSuccess(targetStore, object, property, index);
    await this._cleanUsage(hash, object.uuid);
    return update;
  }

  async cascadeDelete(info, uuid) {
    return this._cleanUsage(info.hash, uuid).catch(function(err) {
      this._webda.log("WARN", "Cascade delete failed", err);
    });
  }

  _exists(hash) {
    return false;
  }

  _getPath(hash, postfix = undefined) {
    if (postfix === undefined) {
      return hash + "/data";
    }
    return hash + "/" + postfix;
  }

  _getUrl(info, ctx: Context) {
    // Dont return any url if
    if (!ctx) return;
    return (
      ctx._route._http.protocol +
      "://" +
      ctx._route._http.headers.host +
      this._url +
      "/upload/data/" +
      ctx.getRequestBody().hash
    );
  }

  async _getS3(hash) {
    return this._s3
      .headObject({
        Bucket: this._params.bucket,
        Key: this._getPath(hash),
      })
      .promise()
      .catch(function(err) {
        if (err.code !== "NotFound") {
          return Promise.reject(err);
        }
        return Promise.resolve();
      });
  }

  getObject(key: string, bucket: string = undefined) {
    bucket = bucket || this._params.bucket;
    var s3obj = new this.AWS.S3({
      endpoint: this._params.endpoint,
      s3ForcePathStyle: this._params.s3ForcePathStyle || false,
      params: {
        Bucket: bucket,
        Key: key,
      },
    });
    return s3obj.getObject().createReadStream();
  }

  async putObject(
    key: string,
    body: Buffer | Blob | string | ReadableStream,
    metadatas = {},
    bucket: string = undefined
  ) {
    bucket = bucket || this._params.bucket;
    var s3obj = new this.AWS.S3({
      endpoint: this._params.endpoint,
      s3ForcePathStyle: this._params.s3ForcePathStyle || false,
      params: {
        Bucket: bucket,
        Key: key,
        Metadata: metadatas,
      },
    });
    await s3obj
      .upload({
        Body: body,
      })
      .promise();
  }

  async store(targetStore, object, property, file, metadatas, index = "add"): Promise<any> {
    this._checkMap(targetStore._name, property);
    this._prepareInput(file);
    file = _extend(file, this._getHashes(file.buffer));
    let data = await this._getS3(file.hash);
    if (data === undefined) {
      let s3metas: any = {};
      s3metas["x-amz-meta-challenge"] = file.challenge;
      var s3obj = new this.AWS.S3({
        endpoint: this._params.endpoint,
        s3ForcePathStyle: this._params.s3ForcePathStyle || false,
        params: {
          Bucket: this._params.bucket,
          Key: this._getPath(file.hash),
          Metadata: s3metas,
        },
      });
      await s3obj
        .upload({
          Body: file.buffer,
        })
        .promise();
    }
    await this.putMarker(file.hash, object.uuid, targetStore._name);
    return this.updateSuccess(targetStore, object, property, index, file, metadatas);
  }

  async update(targetStore, object, property, index, file, metadatas) {
    await this._cleanUsage(object[property][index].hash, object.uuid);
    return this.store(targetStore, object, property, file, metadatas, index);
  }

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
        "s3:RestoreObject",
      ],
      Resource: [`arn:aws:s3:::${this._params.bucket}`, `arn:aws:s3:::${this._params.bucket}/*`],
    };
  }

  getCloudFormation(deployer: CloudFormationDeployer) {
    if (this._params.CloudFormationSkip) {
      return {};
    }
    let resources = {};
    this._params.CloudFormation = this._params.CloudFormation || {};
    this._params.CloudFormation.Bucket = this._params.CloudFormation.Bucket || {};
    resources[this._name + "Bucket"] = {
      Type: "AWS::S3::Bucket",
      Properties: {
        ...this._params.CloudFormation.Bucket,
        BucketName: this._params.bucketName,
        Tags: deployer.getDefaultTags(this._params.CloudFormation.Bucket.Tags),
      },
    };
    // Add any Other resources with prefix of the service
    return resources;
  }

  static getModda(): ModdaDefinition {
    return {
      uuid: "Webda/S3Binary",
      label: "S3 Binary",
      description:
        "Implements S3 storage, so you can upload binary from users, handles mapping with other objects. It only stores once a binary, and if you use the attached Polymer behavior it will not even uplaod file if they are on the server already",
      documentation: "https://raw.githubusercontent.com/loopingz/webda/master/readmes/Binary.md",
      logo: "images/icons/s3.png",
      configuration: {
        schema: {
          type: "object",
          properties: {
            expose: {
              type: "boolean",
              default: true,
            },
            accessKeyId: {
              type: "string",
            },
            secretAccessKey: {
              type: "string",
            },
            bucket: {
              type: "string",
              default: "YOUR S3 Bucket",
            },
          },
          required: ["accessKeyId", "secretAccessKey", "bucket"],
        },
      },
    };
  }
}

export { S3Binary };
