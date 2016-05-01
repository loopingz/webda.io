"use strict";
const Store = require("./store")

const AWS = require('aws-sdk');

class DynamoStore extends Store {
	constructor(webda, name, params) {
		super(webda, name, params);
		if (params.accessKeyId === undefined || params.accessKeyId === '') {
			this._params.accessKeyId = params.accessKeyId = process.env["WEBDA_AWS_KEY"];
		}
		if (params.secretAccessKey === undefined || params.secretAccessKey === '') {
			this._params.secretAccessKey = params.secretAccessKey = process.env["WEBDA_AWS_SECRET"];
		}
		this._connectPromise = undefined;
		if (params.table === undefined || params.accessKeyId === undefined || params.secretAccessKey === undefined) {
			throw Error("Need to define a table,accessKeyId,secretAccessKey at least");
		}
		if (params.region !== undefined) {
			AWS.config.region = params.region;
		}
		AWS.config.update({accessKeyId: params.accessKeyId, secretAccessKey: params.secretAccessKey});
		this._client = new AWS.DynamoDB.DocumentClient();
	}

	init(config) {
		super.init(config);
	}

	exists(uid) {
		// Should use find + limit 1
		return this._get(uid).then (function (result) {
			Promise.resolve(result !== undefined);
		});
	}

	_save(object, uid) {
		var params = {'TableName': this._params.table, 'Item': object};
		return this._client.put(params).promise().then (function(result) {
			return Promise.resolve(object);
		});
	}

	_find(request, offset, limit) {
		return this._connect().then( function() {
			return new Promise( function (resolve, reject) {
				this._collection.find({ _id: uid}, function(err, result) {
					if (err) {
						reject(err);
					}
					resolve(result);
				});
			}.bind(this));
		}.bind(this));
	}

	_delete(uid) {
		var params = {'TableName': this._params.table, 'Key': {"uuid": uid}};
		return this._client.delete(params).promise().then (function(result) {
			return Promise.resolve(result);
		});
	}

	_update(object, uid) {
		var expr = "SET ";
		var sep = "";
		var attrValues = {};
		var attrs = {};
		var skipUpdate = true;
		for (var attr in object) {
			if (attr === 'uuid') {
				continue;
			}
			skipUpdate = false;
			expr += sep + "#" + attr + " = :" + attr;
			attrValues[":" + attr]=object[attr];
			attrs["#"+attr]=attr;
			sep = ",";
		}
		if (skipUpdate) {
			return Promise.resolve();
		}
		var params = {'TableName': this._params.table, 'Key': {"uuid": uid}, 'UpdateExpression': expr, ExpressionAttributeValues: attrValues, ExpressionAttributeNames: attrs};
		return this._client.update(params).promise().then (function(result) {
			return Promise.resolve(result);
		});
	}

	_get(uid) {
		var params = {'TableName': this._params.table, 'Key': {"uuid": uid}};
		return this._client.get(params).promise().then (function(result) {
			return Promise.resolve(result.Item);
		});
	}

	___cleanData() {
		return Promise.resolve();
	}
}

module.exports = DynamoStore;