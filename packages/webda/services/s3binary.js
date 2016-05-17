"use strict";
// Load the AWS SDK for Node.js
const AWS = require('aws-sdk');
const zlib = require('zlib');
const crypto = require('crypto');
const Binary = require("./binary");
const _extend = require('util')._extend;

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
class S3Binary extends Binary {
	/** @ignore */
	constructor(webda, name, params) {
		super(webda, name, params);
		/** Used for test purpose */
		if (params.accessKeyId === undefined) {
			this._params.accessKeyId = params.accessKeyId = process.env["WEBDA_AWS_KEY"];
		}
		if (params.secretAccessKey === undefined) {
			this._params.secretAccessKey = params.secretAccessKey = process.env["WEBDA_AWS_SECRET"];
		}
		if (params.bucket === undefined || params.accessKeyId === undefined || params.secretAccessKey === undefined) {
			this._createException = "Need to define a bucket,accessKeyId,secretAccessKey at least";
		}
		if (params.region !== undefined) {
			AWS.config.region = params.region;
		}
		AWS.config.update({accessKeyId: params.accessKeyId, secretAccessKey: params.secretAccessKey});
	}

	init(config) {
		super.init(config);
		this._s3 = new AWS.S3();
	}

	initRoutes(config, expose) {
		super.initRoutes(config, expose);
		// Will use getRedirectUrl so override the default route
		var url = this._url + "/{store}/{uid}/{property}/{index}";
      	config[url] = {"method": ["GET"], "executor": this._name, "expose": expose, "_method": this.getRedirectUrl, "aws": {"defaultCode": 302, "headersMap": ['Location', 'Set-Cookie']}};
	}

	putRedirectUrl() {
		if (this.body.hash === undefined) {
			console.log("Request not conform", this.body);
			throw 403;
		}
		let targetStore = this._verifyMapAndStore();
		var base64String = new Buffer(this.body.hash, 'hex').toString('base64');
		var params = {Bucket: this._params.bucket, Key: this._getPath(this.body.hash), 'ContentType': 'application/octet-stream', 'ContentMD5': base64String};
		// List bucket
		return this._s3.listObjectsV2({Bucket: this._params.bucket, Prefix: this._getPath(this.body.hash, '')}).promise().then( (data) => {
			let foundMap = false;
			let foundData = false;
			for (let i in data.Contents) {
				if (data.Contents[i].Key.endsWith('data')) foundData = true;
				if (data.Contents[i].Key.endsWith(this._params.uid)) foundMap = true;
			}
			if (foundMap) {
				if (foundData) return Promise.resolve();
				return this.getSignedUrl('putObject', params);
			}
			return targetStore.get(this._params.uid).then( (object) => {
				return this.updateSuccess(targetStore, object, this._params.property, 'add', this.body, this.body.metadatas);
			}).then ( (updated) => {
				return this.putMarker(this.body.hash, this._params.uid, this._params.store);
			}).then ( () => {
				return this.getSignedUrl('putObject', params);
			});
		});
	}

	putMarker(hash, uuid, storeName) {
		var s3obj = new AWS.S3({params: {Bucket: this._params.bucket, Key: this._getPath(hash, uuid), Metadata: {'x-amz-meta-store': storeName}}});
		return s3obj.putObject().promise();
	}

	getSignedUrl(action, params) {
		return new Promise( (resolve, reject) => {
			let callback = function(err, url) {
				if (err) {
					reject(err);
				}
				return resolve(url);
			}
			this._s3.getSignedUrl(action, params, callback);
		});
	}

	getRedirectUrl() {
		let targetStore = this._verifyMapAndStore();
		return targetStore.get(this._params.uid).then( (obj) => {
			if (obj === undefined || obj[this._params.property] === undefined || obj[this._params.property][this._params.index] === undefined) {
				throw 404;
			}
			let info = obj[this._params.property][this._params.index];
			var params = {Bucket: this._params.bucket, Key: this._getPath(info.hash)};
			params.Expires = 30; // A get should not take more than 30s
			this.emit('binaryGet', {'object': info, 'service': this});
			params.ResponseContentDisposition = "attachment; filename=" + info.name;
			params.ResponseContentType = info.mimetype;
			return this.getSignedUrl('getObject', params);
		}).then( (url) => {
			this.writeHead(302, {'Location': url});
			this.end();
			return Promise.resolve();
		});
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
		return this.deleteSuccess(targetStore, object, property, index).then ( (update) => {
			return this._cleanUsage(hash, object.uuid).then ( () => {
				return Promise.resolve(update);
			});	
		});
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
		if (index === undefined) {
			index = "add";
		}
		return this._get(file.hash).then((data) => {
			if (data === undefined) {
				var metadatas = {};
				metadatas['x-amz-meta-challenge']=file.challenge;
				var s3obj = new AWS.S3({params: {Bucket: self._params.bucket, Key: self._getPath(file.hash), "Metadata": metadatas}});
				return new Promise((resolve, reject) => {
					s3obj.upload({Body: file.buffer}, function (err, data) {
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
		}).then (() => {
			return self.updateSuccess(targetStore, object, property, index, file, metadatas);
		});
	}

	update(targetStore, object, property, index, file, metadatas) {
		return this._cleanUsage(object[property][index].hash, object.uuid).then( () => {
			return this.store(targetStore, object, property, file, metadatas, index);
		});
	}

	___cleanData() {
		return this._s3.listObjectsV2({Bucket: this._params.bucket}).promise().then( (data) => {
			var params = {Bucket: this._params.bucket, Delete: { Objects: []}};
			for (var i in data.Contents) {
				params.Delete.Objects.push({Key: data.Contents[i].Key});
			}
			if (params.Delete.Objects.length === 0) {
				return Promise.resolve();
			}
			return this._s3.deleteObjects(params).promise();
		});
	}

	static getModda() {
		return {
			"uuid": "Webda/S3Binary",
			"label": "S3 Binary",
			"description": "Implements S3 storage, so you can upload binary from users, handles mapping with other objects. It only stores once a binary, and if you use the attached Polymer behavior it will not even uplaod file if they are on the server already",
			"webcomponents": [],
			"documentation": "https://raw.githubusercontent.com/loopingz/webda/master/readmes/Binary.md",
			"logo": "images/placeholders/s3.png",
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
