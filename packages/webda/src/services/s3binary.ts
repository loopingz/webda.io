"use strict";
// Load the AWS SDK for Node.js
import {
  Binary,
  AWSMixIn,
  _extend,
  Context,
  Service,
  Core as Webda
} from '../index';

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
class S3Binary extends AWSMixIn(Binary) {
  AWS: any;
  _s3: any;

  /** @ignore */
  constructor(webda, name, params) {
    super(webda, name, params);
    if (params.bucket === undefined) {
      throw new Error("Need to define a bucket at least");
    }
    this.AWS = this._getAWS(params);
  }

  async init(): Promise < void > {
    await super.init();
    this._s3 = new this.AWS.S3();
  }

  initRoutes() {
    super.initRoutes();
    // Will use getRedirectUrl so override the default route
    var url = this._url + "/{store}/{uid}/{property}/{index}";
    this._addRoute(url, ["GET"], this.getRedirectUrl, {
      get: {
        description: 'Download a binary linked to an object',
        summary: 'Download a binary',
        operationId: `getBinary`,
        responses: {
          '302': 'Redirect to download url',
          '403': "You don't have permissions",
          '404': 'Object does not exist or attachment does not exist',
          '412': 'Provided hash does not match'
        }
      }
    });
  }

  async putRedirectUrl(ctx: Context): Promise < string > {
    if (ctx.body.hash === undefined) {
      this._webda.log('WARN', 'Request not conform', ctx.body);
      throw 403;
    }
    let targetStore = this._verifyMapAndStore(ctx);
    let object: any = await targetStore.get(ctx._params.uid);
    await object.canAct(ctx, 'attach_binary');
    var base64String = new Buffer(ctx.body.hash, 'hex').toString('base64');
    var params = {
      Bucket: this._params.bucket,
      Key: this._getPath(ctx.body.hash),
      'ContentType': 'application/octet-stream',
      'ContentMD5': base64String
    };
    // List bucket
    let data = this._s3.listObjectsV2({
      Bucket: this._params.bucket,
      Prefix: this._getPath(ctx.body.hash, '')
    }).promise();
    let foundMap = false;
    let foundData = false;
    for (let i in data.Contents) {
      if (data.Contents[i].Key.endsWith('data')) foundData = true;
      if (data.Contents[i].Key.endsWith(ctx._params.uid)) foundMap = true;
    }
    if (foundMap) {
      if (foundData) return;
      return this.getSignedUrl('putObject', params);
    }
    await this.updateSuccess(targetStore, object, ctx._params.property, 'add', ctx.body, ctx.body.metadatas);
    await this.putMarker(ctx.body.hash, ctx._params.uid, ctx._params.store);
    return this.getSignedUrl('putObject', params);
  }

  putMarker(hash, uuid, storeName) {
    var s3obj = new this.AWS.S3({
      params: {
        Bucket: this._params.bucket,
        Key: this._getPath(hash, uuid),
        Metadata: {
          'x-amz-meta-store': storeName
        }
      }
    });
    return s3obj.putObject().promise();
  }

  getSignedUrl(action, params): string {
    return this._s3.getSignedUrl(action, params);
  }

  async getRedirectUrlFromObject(obj, property, index, context, expire = 30) {
    let info = obj[property][index];
    var params: any = {
      Bucket: this._params.bucket,
      Key: this._getPath(info.hash)
    };
    params.Expires = expire; // A get should not take more than 30s
    await this.emitSync('Binary.Get', {
      'object': info,
      'service': this,
      'context': context
    });
    params.ResponseContentDisposition = "attachment; filename=" + info.name;
    params.ResponseContentType = info.mimetype;
    return this.getSignedUrl('getObject', params);
  }

  async getRedirectUrl(ctx) {
    let targetStore = this._verifyMapAndStore(ctx);
    let obj = await targetStore.get(ctx._params.uid);
    if (obj === undefined || obj[ctx._params.property] === undefined || obj[ctx._params.property][ctx._params.index] === undefined) {
      throw 404;
    }
    await obj.canAct(ctx, 'get_binary');
    let url = await this.getRedirectUrlFromObject(obj, ctx._params.property, ctx._params.index, ctx);
    ctx.writeHead(302, {
      'Location': url
    });
    ctx.end();
  }

  _get(info) {
    return this._s3.getObject({
      Bucket: this._params.bucket,
      Key: this._getPath(info.hash)
    }).createReadStream();
  }

  async getUsageCount(hash): Promise < number > {
    // Not efficient if more than 1000 docs
    let data = await this._s3.listObjects({
      Bucket: this._params.bucket,
      Prefix: this._getPath(hash, '')
    }).promise();
    return data.Contents.length ? data.Contents.length - 1 : 0;
  }

  _cleanHash(hash) {

  }

  async _cleanUsage(hash, uuid) {
    // Dont clean data for now
    var params = {
      Bucket: this._params.bucket,
      Key: this._getPath(hash, uuid)
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
      this._webda.log('WARN', 'Cascade delete failed', err);
    });
  }

  _exists(hash) {
    return false;
  }

  _getPath(hash, postfix = undefined) {
    if (postfix === undefined) {
      return hash + '/data';
    }
    return hash + '/' + postfix;
  }

  _getUrl(info, ctx: Context) {
    // Dont return any url if 
    if (!ctx) return;
    return ctx._route._http.protocol + "://" + ctx._route._http.headers.host + this._url + "/upload/data/" + ctx.body.hash;
  }

  async _getS3(hash) {
    return this._s3.headObject({
      Bucket: this._params.bucket,
      Key: this._getPath(hash)
    }).promise().catch(function(err) {
      if (err.code !== 'NotFound') {
        return Promise.reject(err);
      }
      return Promise.resolve();
    });
  }

  async store(targetStore, object, property, file, metadatas, index = "add"): Promise < any > {
    this._checkMap(targetStore._name, property);
    this._prepareInput(file);
    file = _extend(file, this._getHashes(file.buffer));
    let data = await this._getS3(file.hash);
    if (data === undefined) {
      let s3metas: any = {};
      s3metas['x-amz-meta-challenge'] = file.challenge;
      var s3obj = new this.AWS.S3({
        params: {
          Bucket: this._params.bucket,
          Key: this._getPath(file.hash),
          "Metadata": s3metas
        }
      });
      await s3obj.upload({
        Body: file.buffer
      }).promise();
    }
    await this.putMarker(file.hash, object.uuid, targetStore._name);
    return this.updateSuccess(targetStore, object, property, index, file, metadatas);
  }

  async update(targetStore, object, property, index, file, metadatas) {
    await this._cleanUsage(object[property][index].hash, object.uuid);
    return this.store(targetStore, object, property, file, metadatas, index);
  }

  async ___cleanData() {
    let data = await this._s3.listObjectsV2({
      Bucket: this._params.bucket
    }).promise();
    var params = {
      Bucket: this._params.bucket,
      Delete: {
        Objects: []
      }
    };
    for (var i in data.Contents) {
      params.Delete.Objects.push({
        Key: data.Contents[i].Key
      });
    }
    if (params.Delete.Objects.length === 0) {
      return;
    }
    return this._s3.deleteObjects(params).promise();
  }

  async install(params) {
    if (this._params.region) {
      params.region = this._params.region;
    }
    var s3 = new(this._getAWS(params)).S3();
    return s3.headBucket({
      Bucket: this._params.bucket
    }).promise().catch((err) => {
      if (err.code === 'Forbidden') {
        this._webda.log('ERROR', 'S3 bucket already exists in another account');
      } else if (err.code === 'NotFound') {
        this._webda.log('INFO', 'Creating S3 Bucket', this._params.bucket);
        return s3.createBucket({
          Bucket: this._params.bucket
        }).promise();
      }
    });
  }

  getARNPolicy(accountId) {
    return {
      "Sid": this.constructor.name + this._name,
      "Effect": "Allow",
      "Action": [
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
      "Resource": [
        'arn:aws:s3:::' + this._params.bucket
      ]
    }
  }

  static getModda() {
    return {
      "uuid": "Webda/S3Binary",
      "label": "S3 Binary",
      "description": "Implements S3 storage, so you can upload binary from users, handles mapping with other objects. It only stores once a binary, and if you use the attached Polymer behavior it will not even uplaod file if they are on the server already",
      "webcomponents": [],
      "documentation": "https://raw.githubusercontent.com/loopingz/webda/master/readmes/Binary.md",
      "logo": "images/icons/s3.png",
      "configuration": {
        "default": {
          "bucket": "YOUR S3 Bucket",
          "expose": true
        },
        "schema": {
          type: "object",
          properties: {
            "expose": {
              type: "boolean"
            },
            "accessKeyId": {
              type: "string"
            },
            "secretAccessKey": {
              type: "string"
            },
            "bucket": {
              type: "string"
            }
          },
          required: ["accessKeyId", "secretAccessKey", "bucket"]
        }
      }
    }
  }
}

export {
  S3Binary
};
