"use strict";
// Load the AWS SDK for Node.js
const Binary = require("./binary");
const _extend = require('util')._extend;
const AWSServiceMixIn = require("./aws-mixin");

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
class S3Binary extends AWSServiceMixIn(Binary) {
  /** @ignore */
  constructor(webda, name, params) {
    super(webda, name, params);
    // Used for test purpose
    if (params.accessKeyId === undefined) {
      this._params.accessKeyId = params.accessKeyId = process.env["WEBDA_AWS_KEY"];
    }
    if (params.secretAccessKey === undefined) {
      this._params.secretAccessKey = params.secretAccessKey = process.env["WEBDA_AWS_SECRET"];
    }
    if (params.bucket === undefined) {
      this._createException = "Need to define a bucket,accessKeyId,secretAccessKey at least";
    }
    this.AWS = this._getAWS(params);
  }

  init(config) {
    super.init(config);
    this._s3 = new this.AWS.S3();
  }

  initRoutes(config, expose) {
    super.initRoutes(config, expose);
    // Will use getRedirectUrl so override the default route
    var url = this._url + "/{store}/{uid}/{property}/{index}";
    this._addRoute(url, {
      "method": ["GET"],
      "executor": this._name,
      "expose": expose,
      "_method": this.getRedirectUrl
    });
  }

  putRedirectUrl(ctx) {
    if (ctx.body.hash === undefined) {
      this._webda.log('WARN', 'Request not conform', ctx.body);
      throw 403;
    }
    let targetStore = this._verifyMapAndStore(ctx);
    var base64String = new Buffer(ctx.body.hash, 'hex').toString('base64');
    var params = {
      Bucket: this._params.bucket,
      Key: this._getPath(ctx.body.hash),
      'ContentType': 'application/octet-stream',
      'ContentMD5': base64String
    };
    // List bucket
    return this._s3.listObjectsV2({
      Bucket: this._params.bucket,
      Prefix: this._getPath(ctx.body.hash, '')
    }).promise().then((data) => {
      let foundMap = false;
      let foundData = false;
      for (let i in data.Contents) {
        if (data.Contents[i].Key.endsWith('data')) foundData = true;
        if (data.Contents[i].Key.endsWith(ctx._params.uid)) foundMap = true;
      }
      if (foundMap) {
        if (foundData) return Promise.resolve();
        return this.getSignedUrl('putObject', params);
      }
      return targetStore.get(ctx._params.uid).then((object) => {
        return this.updateSuccess(targetStore, object, ctx._params.property, 'add', ctx.body, ctx.body.metadatas);
      }).then((updated) => {
        return this.putMarker(ctx.body.hash, ctx._params.uid, ctx._params.store);
      }).then(() => {
        return this.getSignedUrl('putObject', params);
      });
    });
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

  getSignedUrl(action, params) {
    return new Promise((resolve, reject) => {
      let callback = function(err, url) {
        if (err) {
          reject(err);
        }
        return resolve(url);
      }
      this._s3.getSignedUrl(action, params, callback);
    });
  }

  getRedirectUrlFromObject(obj, property, index, context, expire) {
    let info = obj[property][index];
    var params = {
      Bucket: this._params.bucket,
      Key: this._getPath(info.hash)
    };
    if (expire === undefined) {
      expire = 30;
    }
    params.Expires = expire; // A get should not take more than 30s
    return this.emit('Binary.Get', {
      'object': info,
      'service': this,
      'context': context
    }).then(() => {
      params.ResponseContentDisposition = "attachment; filename=" + info.name;
      params.ResponseContentType = info.mimetype;
      return this.getSignedUrl('getObject', params);
    });
  }

  getRedirectUrl(ctx) {
    let targetStore = this._verifyMapAndStore(ctx);
    return targetStore.get(ctx._params.uid).then((obj) => {
      if (obj === undefined || obj[ctx._params.property] === undefined || obj[ctx._params.property][ctx._params.index] === undefined) {
        throw 404;
      }
      return obj.canAct(ctx, 'get_binary');
    }).then((obj) => {
      return this.getRedirectUrlFromObject(obj, ctx._params.property, ctx._params.index, ctx);
    }).then((url) => {
      ctx.writeHead(302, {
        'Location': url
      });
      ctx.end();
      return Promise.resolve();
    });
  }

  _get(info) {
    return this._s3.getObject({
      Bucket: this._params.bucket,
      Key: this._getPath(info.hash)
    }).createReadStream();
  }

  getUsageCount(hash) {
    // Not efficient if more than 1000 docs
    return this._s3.listObjects({
      Bucket: this._params.bucket,
      Prefix: this._getPath(hash, '')
    }).promise().then(function(data) {
      return Promise.resolve(data.Contents.length - 1);
    });
  }

  _cleanHash(hash) {

  }

  _cleanUsage(hash, uuid) {
    // Dont clean data for now
    var params = {
      Bucket: this._params.bucket,
      Key: this._getPath(hash, uuid)
    };
    return this._s3.deleteObject(params).promise();
  }

  delete(targetStore, object, property, index) {
    var hash = object[property][index].hash;
    return this.deleteSuccess(targetStore, object, property, index).then((update) => {
      return this._cleanUsage(hash, object.uuid).then(() => {
        return Promise.resolve(update);
      });
    });
  }

  cascadeDelete(info, uuid) {
    return this._cleanUsage(info.hash, uuid).catch(function(err) {
      this._webda.log('WARN', 'Cascade delete failed', err);
    });
  }

  _exists(hash) {
    return false;
  }

  _getPath(hash, postfix) {
    if (postfix === undefined) {
      return hash + '/data';
    }
    return hash + '/' + postfix;
  }

  _getUrl(info, ctx) {
    // Dont return any url if 
    if (!ctx) return;
    return ctx._route._http.protocol + "://" + ctx._route._http.headers.host + this._url + "/upload/data/" + ctx.body.hash;
  }

  _getS3(hash) {
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

  store(targetStore, object, property, file, metadatas, index) {
    var self = this;
    this._checkMap(targetStore._name, property);
    this._prepareInput(file);
    file = _extend(file, this._getHashes(file.buffer));
    if (index === undefined) {
      index = "add";
    }
    return this._getS3(file.hash).then((data) => {
      if (data === undefined) {
        var metadatas = {};
        metadatas['x-amz-meta-challenge'] = file.challenge;
        var s3obj = new this.AWS.S3({
          params: {
            Bucket: self._params.bucket,
            Key: self._getPath(file.hash),
            "Metadata": metadatas
          }
        });
        return new Promise((resolve, reject) => {
          s3obj.upload({
            Body: file.buffer
          }, function(err, data) {
            if (err) {
              return reject(err);
            }
            return resolve();
          });
        });
      }
      return Promise.resolve();
    }).then(() => {
      return this.putMarker(file.hash, object.uuid, targetStore._name);
    }).then(() => {
      return self.updateSuccess(targetStore, object, property, index, file, metadatas);
    });
  }

  update(targetStore, object, property, index, file, metadatas) {
    return this._cleanUsage(object[property][index].hash, object.uuid).then(() => {
      return this.store(targetStore, object, property, file, metadatas, index);
    });
  }

  ___cleanData() {
    return this._s3.listObjectsV2({
      Bucket: this._params.bucket
    }).promise().then((data) => {
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
        return Promise.resolve();
      }
      return this._s3.deleteObjects(params).promise();
    });
  }

  install(params) {
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

module.exports = S3Binary;
