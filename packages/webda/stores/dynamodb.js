"use strict";
const Store = require("./store");
const CoreModel = require("../models/coremodel");
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
      this._createException = "Need to define a table,accessKeyId,secretAccessKey at least";
    }
    if (params.region !== undefined) {
      AWS.config.update({region: params.region});
    }
    AWS.config.update({accessKeyId: params.accessKeyId, secretAccessKey: params.secretAccessKey});
    this._client = new AWS.DynamoDB.DocumentClient();
  }

  init(config) {
    super.init(config);
  }

  exists(uid) {
    // Should use find + limit 1
    return this._get(uid).then(function (result) {
      Promise.resolve(result !== undefined);
    });
  }

  _save(object, uid) {
    object = this._cleanObject(object);
    // Cannot have empty attribute on DynamoDB need to clean this
    var params = {'TableName': this._params.table, 'Item': object};
    return this._client.put(params).promise().then(function (result) {
      return Promise.resolve(object);
    });
  }

  _find(request) {
    var scan = false;
    if (request === {} || request === undefined) {
      request = {};
      scan = true;
    }
    request.TableName = this._params.table;
    if (scan) {
      return this._client.scan(request).promise().then((result) => {
        return Promise.resolve(result.Items);
      });
    } else {
      return this._client.query(request).promise().then((result) => {
        return Promise.resolve(result.Items);
      });
    }
  }

  _serializeDate(date) {
    return JSON.stringify(date).replace(/"/g, "");
  }

  _cleanObject(object) {
    if (typeof(object) !== "object") return object;
    if (object instanceof Date) {
      return this._serializeDate(object);
    }
    if (object instanceof CoreModel) {
      object = object.toStoredJSON();
    }
    var res;
    if (object instanceof Array) {
      res = [];
    } else {
      res = {};
    }
    for (let i in object) {
      if (object[i] === '') {
        continue
      }
      res[i] = this._cleanObject(object[i]);
    }
    return res;
  }

  _deleteItemFromCollection(uid, prop, index, itemWriteCondition, itemWriteConditionField) {
    var params = {'TableName': this._params.table, 'Key': {"uuid": uid}};
    var attrs = {};
    attrs["#" + prop] = prop;
    params.ExpressionAttributeNames = attrs;
    params.UpdateExpression = "REMOVE #" + prop + "[" + index + "]";
    params.WriteCondition = "attribute_not_exists(#" + prop + "[" + index + "]) AND #" + prop + "[" + index + "]." + itemWriteConditionField + " = " + itemWriteCondition;
    return this._client.update(params).promise();
  }

  _upsertItemToCollection(uid, prop, item, index, itemWriteCondition, itemWriteConditionField) {
    var params = {'TableName': this._params.table, 'Key': {"uuid": uid}};
    var attrValues = {};
    var attrs = {};
    attrs["#" + prop] = prop;
    attrValues[":" + prop] = this._cleanObject(item);
    params.ExpressionAttributeValues = attrValues;
    params.ExpressionAttributeNames = attrs;
    if (index === undefined) {
      params.UpdateExpression = "SET #" + prop + "= list_append(if_not_exists (#" + prop + ", :empty_list),:" + prop + ")";
      attrValues[":" + prop] = [attrValues[":" + prop]];
      attrValues[":empty_list"] = [];
    } else {
      params.UpdateExpression = "SET #" + prop + "[" + index + "] = :" + prop;
      params.WriteCondition = "attribute_not_exists(#" + prop + "[" + index + "]) AND #" + prop + "[" + index + "]." + itemWriteConditionField + " = " + itemWriteCondition;
    }
    return this._client.update(params).promise();
  }

  _getWriteCondition(writeCondition) {
    if (writeCondition instanceof Date) {
      writeCondition = this._serializeDate(writeCondition);
    }
    return this._writeConditionField + ' = ' + writeCondition;
  }

  _delete(uid, writeCondition) {
    var params = {'TableName': this._params.table, 'Key': {"uuid": uid}};
    if (writeCondition) {
      params.WriteCondition = this._getWriteCondition(writeCondition);
    }
    return this._client.delete(params).promise().then((result) => {
      return Promise.resolve(result);
    });
  }

  _update(object, uid, writeCondition) {
    object = this._cleanObject(object);
    var expr = "SET ";
    var sep = "";
    var attrValues = {};
    var attrs = {};
    var skipUpdate = true;
    var i = 1;
    for (var attr in object) {
      if (attr === 'uuid' || object[attr] === undefined) {
        continue;
      }
      skipUpdate = false;
      expr += sep + "#a" + i + " = :v" + i;
      attrValues[":v" + i] = object[attr];
      attrs["#a" + i] = attr;
      sep = ",";
      i++;
    }
    if (skipUpdate) {
      return Promise.resolve();
    }
    var params = {
      'TableName': this._params.table,
      'Key': {"uuid": uid},
      'UpdateExpression': expr,
      ExpressionAttributeValues: attrValues,
      ExpressionAttributeNames: attrs
    };
    // The Write Condition checks the value before writing
    if (writeCondition) {
      params.WriteCondition = this._getWriteCondition(writeCondition);
    }
    return this._client.update(params).promise();
  }

  _scan(items, paging) {
    return new Promise((resolve, reject) => {
      this._client.scan({TableName: this._params.table, Limit: this._params.scanPage, ExclusiveStartKey: paging}, (err, data) => {
        if (err) {
          reject(err);
        }
        for (let i in data.Items) {
          items.push(this.initModel(data.Items[i]));
        }
        if (data.LastEvaluatedKey) {
          return resolve(this._scan(items, data.LastEvaluatedKey));
        }
        return resolve(items);
      });
    });
  }

  getAll(uids) {
    if (!uids) {
      return this._scan([]);
    }
    var params = {'RequestItems': {}};
    params['RequestItems'][this._params.table] = {
      'Keys': uids.map((value) => {
        return {"uuid": value};
      })
    };
    return this._client.batchGet(params).promise().then((result) => {
      return Promise.resolve(result.Responses[this._params.table].map(this.initModel, this));
    });
  }

  _get(uid) {
    var params = {'TableName': this._params.table, 'Key': {"uuid": uid}};
    return this._client.get(params).promise().then((result) => {
      return Promise.resolve(result.Item);
    });
  }

  incrementAttribute(uid, prop, value) {
    var params = {
      'TableName': this._params.table,
      'Key': {"uuid": uid},
      'UpdateExpression': 'ADD #a1 :v1',
      ExpressionAttributeValues: {':v1': value},
      ExpressionAttributeNames: {'#a1': prop}
    };
    return this._client.update(params).promise();
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
    return this._client.scan(params).promise().then((result) => {
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
      "documentation": "https://raw.githubusercontent.com/loopingz/webda/master/readmes/Store.md",
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
