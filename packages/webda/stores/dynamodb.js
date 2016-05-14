"use strict";
const Store = require("./store")

const AWS = require('aws-sdk');

/**
 * DynamoStore handles the DynamoDB
 *
 * Parameters:
 *   accessKeyId: '' // try WEBDA_AWS_KEY env variable if not found
 *   secretAccessKey: '' // try WEBDA_AWS_SECRET env variable if not found
 *   table: ''
 *   region: ''
 *
 */
class DynamoStore extends Store {
	/** @ignore */
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
			AWS.config.update({region:params.region});
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
		object = this._cleanObject(object);
		// Cannot have empty attribute on DynamoDB need to clean this
		var params = {'TableName': this._params.table, 'Item': object};
		return this._client.put(params).promise().then (function(result) {
			return Promise.resolve(object);
		});
	}

	_find(request, offset, limit) {
		return this._connect().then( () => {
			return new Promise( (resolve, reject) => {
				this._collection.find({ _id: uid}, function(err, result) {
					if (err) {
						reject(err);
					}
					resolve(result);
				});
			});
		});
	}

	_cleanObject(object) {
		if (typeof(object) !== "object" || object instanceof Array) return object;
		var res = {};
		for (let i in object) {
			 if (object[i] === '') {
			 	continue
			 }
			 res[i]=this._cleanObject(object[i]);
		}
		return res;
	}

	_delete(uid) {
		var params = {'TableName': this._params.table, 'Key': {"uuid": uid}};
		return this._client.delete(params).promise().then ((result) => {
			return Promise.resolve(result);
		});
	}

	_update(object, uid) {
		object = this._cleanObject(object);
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
		return this._client.update(params).promise().then ((result) => {
			return Promise.resolve(result);
		});
	}

	_get(uid) {
		var params = {'TableName': this._params.table, 'Key': {"uuid": uid}};
		return this._client.get(params).promise().then ((result) => {
			return Promise.resolve(result.Item);
		});
	}

	install(params) {
		/* Code sample for later use
		@ignore
		if (params.region !== undefined) {
			AWS.config.update(({region: params.region});
		}
		AWS.config.update({accessKeyId: params.accessKeyId, secretAccessKey: params.secretAccessKey});
		var client = new AWS.DynamoDB.DocumentClient();
		console.log("Should create table ", {'TableName': this._params.table, 'Key': {"uuid": uid}});
		*/
	}

	uninstall(params) {
		/* Code sample for later use
		@ignore
		if (params.region !== undefined) {
			AWS.config.update(({region: params.region});
		}
		AWS.config.update({accessKeyId: params.accessKeyId, secretAccessKey: params.secretAccessKey});
		var client = new AWS.DynamoDB.DocumentClient();
		var params = ""; 
		console.log("Should delete table ", {'TableName': this._params.table, 'Key': {"uuid": uid}});
		*/
	}

	___cleanData() {
		var params = {'TableName': this._params.table};
		return this._client.scan(params).promise().then ((result) => {
			var promises = [];
			for (var i in result.Items) {
				promises.push(this._delete(result.Items[i].uuid));
			}
			return Promise.all(promises);
		});
	}

	static getModda() {
		return {
			"uuid": "Webda/DynamoStore",
			"label": "DynamoStore",
			"description": "Implements DynamoDB NoSQL storage",
			"webcomponents": [],
			"logo": "images/placeholders/dynamodb.png",
			"configuration": {
				"default": {
					"table": "table-name",
				},
				"schema": {
					type: "object",
					properties: {
						"table": {
							type: "string"
						},
						"accessKeyId": {
							type: "string"
						},
						"secretAccessKey": {
							type: "string"
						}
					},
					required: ["table", "accessKeyId", "secretAccessKey"]
				}
			}
		}
	}
}

module.exports = DynamoStore;