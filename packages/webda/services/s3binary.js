"use strict";
// Load the AWS SDK for Node.js
const AWS = require('aws-sdk');
const zlib = require('zlib');
const crypto = require('crypto');
const Binary = require("./binary");
const _extend = require('util')._extend;

class S3Binary extends Binary {
	constructor(webda, name, params) {
		super(webda, name, params);
		if (params.bucket === undefined || params.accessKeyId === undefined || params.secretAccessKey === undefined) {
			throw Error("Need to define a bucket,accessKeyId,secretAccessKey at least");
		}
		if (params.region !== undefined) {
			AWS.config.region = params.region;
		}
		AWS.config.update({accessKeyId: params.accessKeyId, secretAccessKey: params.secretAccessKey});
	}

	init() {
		super.init();
		this._s3 = new AWS.S3();
	}

	getRedirectUrl(info) {
		var params = {Bucket: 'myBucket', Key: 'myKey', Body: 'MD5'};
		return s3.getSignedUrl('putObject', params);
	}

	getRedirectUrl(info) {
		var params = {Bucket: 'myBucket', Key: 'myKey'};
		return s3.getSignedUrl('getObject', params);
	}

	get(info) {
		return this._get(info.hash).createReadStream().send();
	}

	getUsageCount(hash) {
		// Not efficient if more than 1000 docs
		return this._s3.listObjects({Bucket: this._params.bucket, Prefix: this._getPath(hash, '')}).promise().then( function(data) {
			return Promise.resolve(data.Contents.length-1);
		});
	}

	_cleanHash(hash) {

	}

	_cleanUsage(hash, uuid) {
		// Dont clean data for now
		var params = {Bucket: this._params.bucket, Key: this._getPath(hash, uuid)};
		return this._s3.deleteObject(params).promise();
	}

	delete(targetStore, object, property, index) {
		var hash = object[property][index].hash;
		this.deleteSuccess(targetStore, object, property, index);
		return this._cleanUsage(hash, object.uuid);
	}

	cascadeDelete(info, uuid) {
		return this._cleanUsage(info.hash, uuid).catch( function(err) { console.log(err);});
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

	_get(hash) {
		return this._s3.headObject({Bucket: this._params.bucket, Key: this._getPath(hash)}).promise().catch( function(err) {
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
		return this._get(file.hash).then(function(data) {
			if (data === undefined) {
				var metadatas = {};
				metadatas['x-amz-meta-challenge']=file.challenge;
				var s3obj = new AWS.S3({params: {Bucket: self._params.bucket, Key: self._getPath(file.hash), "Metadata": metadatas}});
				return new Promise(function(resolve, reject) {
					s3obj.upload({Body: zlib.deflateSync(file.buffer)}, function (err, data) {
						if (err) {
							return reject(err);
						}
						return resolve();
					});
				});
			}
			return Promise.resolve();
		}).then(function () {
			var s3obj = new AWS.S3({params: {Bucket: self._params.bucket, Key: self._getPath(file.hash, object.uuid), Metadata: {'x-amz-meta-store': targetStore._name}}});
			return s3obj.putObject().promise();
		}).then (function () {
			if (index === undefined) {
				self.storeSuccess(targetStore, object, property, file, metadatas);
			} else {
				self.updateSuccess(targetStore, object, property, index, file, metadatas);
			}
			return Promise.resolve();
		}).catch (function (err) {
			console.log(err);
		});
	}

	update(targetStore, object, property, index, file, metadatas) {
		return this._cleanUsage(object[property][index].hash, object.uuid).then( function () {
			return this.store(targetStore, object, property, file, metadatas, index);
		}.bind(this));
	}

	___cleanData() {
		return this._s3.listObjects({Bucket: this._params.bucket}).promise().then( function(data) {
			var params = {Bucket: this._params.bucket, Delete: { Objects: []}};
			for (var i in data.Contents) {
				params.Delete.Objects.push({Key: data.Contents[i].Key});
			}
			return this._s3.deleteObjects(params).promise();
		}.bind(this)).catch(function (err) {console.log(err);});
	}
}

module.exports = S3Binary;