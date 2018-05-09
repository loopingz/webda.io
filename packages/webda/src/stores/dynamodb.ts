import {
  Store,
  CoreModel,
  AWSMixIn,
  Service,
  Core as Webda
} from '../index';

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
class DynamoStore extends AWSMixIn(Store) {
  _client: any;

  /** @ignore */
  constructor(webda, name, params) {
    super(webda, name, params);
    if (params.table === undefined) {
      throw new Error("Need to define a table,accessKeyId,secretAccessKey at least");
    }
    this._client = new(this._getAWS(params)).DynamoDB.DocumentClient();
  }

  async exists(uid) {
    // Should use find + limit 1
    return (await this._get(uid)) !== undefined;
  }

  async _save(object, uid) {
    object = this._cleanObject(object);
    // Cannot have empty attribute on DynamoDB need to clean this
    var params = {
      'TableName': this._params.table,
      'Item': object
    };
    await this._client.put(params).promise();
    return object
  }

  async _find(request) {
    var scan = false;
    if (request === {} || request === undefined) {
      request = {};
      scan = true;
    }
    request.TableName = this._params.table;
    let result;
    if (scan) {
      result = await this._client.scan(request).promise();
    } else {
      result = await this._client.query(request).promise();
    }
    return result.Items;
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

  async _deleteItemFromCollection(uid, prop, index, itemWriteCondition, itemWriteConditionField) {
    var params: any = {
      'TableName': this._params.table,
      'Key': {
        "uuid": uid
      }
    };
    var attrs = {};
    attrs["#" + prop] = prop;
    params.ExpressionAttributeNames = attrs;
    params.UpdateExpression = "REMOVE #" + prop + "[" + index + "]";
    if (itemWriteCondition) {
      params.ExpressionAttributeValues = {};
      params.ExpressionAttributeValues[":condValue"] = itemWriteCondition;
      attrs["#condName"] = prop;
      attrs["#field"] = itemWriteConditionField;
      params.ConditionExpression = "#condName[" + index + "].#field = :condValue";
    }
    try {
      await this._client.update(params).promise();
    } catch (err) {
      if (err.code === 'ConditionalCheckFailedException') {
        throw Error('UpdateCondition not met');
      }
    }
  }

  async _upsertItemToCollection(uid, prop, item, index, itemWriteCondition, itemWriteConditionField) {
    var params: any = {
      'TableName': this._params.table,
      'Key': {
        "uuid": uid
      }
    };
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
      //attrs["#cond" + prop] += prop + "[" + index + "]." + itemWriteConditionField;
      params.UpdateExpression = "SET #" + prop + "[" + index + "] = :" + prop;
      if (itemWriteCondition) {
        attrValues[":condValue"] = itemWriteCondition;
        attrs["#condName"] = prop;
        attrs["#field"] = itemWriteConditionField;
        params.ConditionExpression = "#condName[" + index + "].#field = :condValue";
      }
    }
    try {
      await this._client.update(params).promise();
    } catch (err) {
      if (err.code === 'ConditionalCheckFailedException') {
        throw Error('UpdateCondition not met');
      }
    }
  }

  _getWriteCondition(writeCondition) {
    if (writeCondition instanceof Date) {
      writeCondition = this._serializeDate(writeCondition);
    }
    return this._writeConditionField + ' = ' + writeCondition;
  }

  async _delete(uid, writeCondition = undefined) {
    var params: any = {
      'TableName': this._params.table,
      'Key': {
        "uuid": uid
      }
    };
    if (writeCondition) {
      params.WriteCondition = this._getWriteCondition(writeCondition);
    }
    return this._client.delete(params).promise();
  }

  async _update(object, uid, writeCondition) {
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
      return;
    }
    var params: any = {
      'TableName': this._params.table,
      'Key': {
        "uuid": uid
      },
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

  async _scan(items, paging = undefined) {
    return new Promise((resolve, reject) => {
      this._client.scan({
        TableName: this._params.table,
        Limit: this._params.scanPage,
        ExclusiveStartKey: paging
      }, (err, data) => {
        if (err) {
          return reject(err);
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

  async getAll(uids) {
    if (!uids) {
      return this._scan([]);
    }
    var params = {
      'RequestItems': {}
    };
    params['RequestItems'][this._params.table] = {
      'Keys': uids.map((value) => {
        return {
          "uuid": value
        };
      })
    };
    let result = await this._client.batchGet(params).promise();
    return result.Responses[this._params.table].map(this.initModel, this);
  }

  async _get(uid) {
    var params = {
      'TableName': this._params.table,
      'Key': {
        "uuid": uid
      }
    };
    return (await this._client.get(params).promise()).Item;
  }

  _incrementAttribute(uid, prop, value) {
    var params = {
      'TableName': this._params.table,
      'Key': {
        "uuid": uid
      },
      'UpdateExpression': 'ADD #a1 :v1',
      ExpressionAttributeValues: {
        ':v1': value
      },
      ExpressionAttributeNames: {
        '#a1': prop
      }
    };
    return this._client.update(params).promise();
  }

  getARNPolicy(accountId) {
    let region = this._params.region || 'us-east-1';
    return {
      "Sid": this.constructor.name + this._name,
      "Effect": "Allow",
      "Action": [
        "dynamodb:BatchGetItem",
        "dynamodb:BatchWriteItem",
        "dynamodb:DeleteItem",
        "dynamodb:GetItem",
        "dynamodb:GetRecords",
        "dynamodb:GetShardIterator",
        "dynamodb:PutItem",
        "dynamodb:Query",
        "dynamodb:Scan",
        "dynamodb:UpdateItem"
      ],
      "Resource": [
        'arn:aws:dynamodb:' + region + ':' + accountId + ':table/' + this._params.table
      ]
    }
  }

  async install(params) {
    if (this._params.region) {
      params.region = this._params.region;
    }
    var dynamodb = new(this._getAWS(params)).DynamoDB();
    return dynamodb.describeTable({
      TableName: this._params.table
    }).promise().catch((err) => {
      if (err.code === 'ResourceNotFoundException') {
        this._webda.log('INFO', 'Creating table', this._params.table);
        let createTable = this._params.createTableParameters || {
          ProvisionedThroughput: {},
          KeySchema: [{
            AttributeName: 'uuid',
            KeyType: 'HASH'
          }],
          AttributeDefinitions: [{
            AttributeName: 'uuid',
            AttributeType: 'S'
          }]
        };
        createTable.TableName = this._params.table;
        createTable.ProvisionedThroughput.ReadCapacityUnits = createTable.ProvisionedThroughput.ReadCapacityUnits || this._params.tableReadCapacity || 5;
        createTable.ProvisionedThroughput.WriteCapacityUnits = createTable.ProvisionedThroughput.WriteCapacityUnits || this._params.tableWriteCapacity || 5;
        return dynamodb.createTable(createTable).promise();
      }
    });
  }

  async uninstall(params) {
    /* Code sample for later use
     @ignore
     if (params.region !== undefined) {
     AWS.config.update(({region: params.region});
     }
     AWS.config.update({accessKeyId: params.accessKeyId, secretAccessKey: params.secretAccessKey});
     var client = new AWS.DynamoDB.DocumentClient();
     var params = "";
     this._webda.log('INFO', {'TableName': this._params.table, 'Key': {"uuid": uid}});
     */
  }

  async __clean() {
    var params = {
      'TableName': this._params.table
    };
    let result = await this._client.scan(params).promise();
    var promises = [];
    for (var i in result.Items) {
      promises.push(this._delete(result.Items[i].uuid));
    }
    return Promise.all(promises);
  }

  static getModda() {
    return {
      "uuid": "Webda/DynamoStore",
      "label": "DynamoStore",
      "description": "Implements DynamoDB NoSQL storage",
      "webcomponents": [],
      "logo": "images/icons/dynamodb.png",
      "documentation": "https://raw.githubusercontent.com/loopingz/webda/master/readmes/Store.md",
      "configuration": {
        "default": {
          "table": "table-name",
        },
        "widget": {
          "tag": "webda-dynamodb-configurator",
          "url": "elements/services/webda-dynamodb-configurator.html"
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

export {
  DynamoStore
};
