import { CoreModel, ModdaDefinition, ServiceParameters, Store, StoreParameters, WebdaError } from "@webda/core";
import { CloudFormationContributor } from ".";
import { CloudFormationDeployer } from "../deployers/cloudformation";
import { GetAWS } from "./aws-mixin";
import * as AWS from "aws-sdk";
import { WorkerOutput } from "@webda/workout";

export class DynamoStoreParameters extends StoreParameters {
  table: string;
  endpoint: string;
  CloudFormation: any;
  CloudFormationSkip: boolean;
  region: string;
  scanPage: number;
}
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
export default class DynamoStore<T extends CoreModel, K extends DynamoStoreParameters = DynamoStoreParameters>
  extends Store<T, K>
  implements CloudFormationContributor {
  _client: any;

  /**
   * Load the parameters
   *
   * @param params
   */
  loadParameters(params: any) {
    return new DynamoStoreParameters(params, this);
  }

  /**
   * Create the AWS client
   */
  computeParameters() {
    super.computeParameters();
    if (this._params.table === undefined) {
      throw new WebdaError(
        "DYNAMODB_TABLE_PARAMETER_REQUIRED",
        "Need to define a table,accessKeyId,secretAccessKey at least"
      );
    }
    this._client = new (GetAWS(this._params).DynamoDB.DocumentClient)({
      endpoint: this._params.endpoint
    });
  }

  static async copyTable(output: WorkerOutput, source, target) {
    let db = new AWS.DynamoDB();
    let ExclusiveStartKey;
    let props = await db
      .describeTable({
        TableName: source
      })
      .promise();
    output.startProgress("copyTable", props.Table.ItemCount, `Copying ${source} to ${target}`);
    do {
      let info = await db
        .scan({
          TableName: source,
          ExclusiveStartKey
        })
        .promise();

      do {
        let items = [];
        while (info.Items.length && items.length < 25) {
          items.push(info.Items.shift());
        }
        if (!items.length) {
          break;
        }
        let params = {
          RequestItems: {}
        };
        params.RequestItems[target] = items.map(Item => ({ PutRequest: { Item } }));
        await db.batchWriteItem(params).promise();
        output.incrementProgress(items.length, "copyTable");
      } while (true);
      ExclusiveStartKey = info.LastEvaluatedKey;
    } while (ExclusiveStartKey);
  }

  async exists(uid) {
    // Should use find + limit 1
    return (await this._get(uid)) !== undefined;
  }

  async _save(object, uid = object.uuid) {
    return this._update(object, uid);
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
    if (typeof object !== "object") return object;
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
      if (object[i] === "" || i.startsWith("__store")) {
        continue;
      }
      res[i] = this._cleanObject(object[i]);
    }
    return res;
  }

  async _removeAttribute(uuid: string, attribute: string) {
    var params: any = {
      TableName: this._params.table,
      Key: {
        uuid
      }
    };
    var attrs = {};
    attrs["#attr"] = attribute;
    attrs["#lastUpdate"] = this._lastUpdateField;
    params.ExpressionAttributeNames = attrs;
    params.ExpressionAttributeValues = {
      ":lastUpdate": this._serializeDate(new Date())
    };
    params.UpdateExpression = "REMOVE #attr SET #lastUpdate = :lastUpdate";
    try {
      await this._client.update(params).promise();
    } catch (err) {
      if (err.code === "ConditionalCheckFailedException") {
        throw Error("UpdateCondition not met");
      }
      throw err;
    }
  }

  async _deleteItemFromCollection(uid, prop, index, itemWriteCondition, itemWriteConditionField, updateDate: Date) {
    var params: any = {
      TableName: this._params.table,
      Key: {
        uuid: uid
      }
    };
    var attrs = {};
    attrs["#" + prop] = prop;
    attrs["#lastUpdate"] = this._lastUpdateField;
    params.ExpressionAttributeNames = attrs;
    params.ExpressionAttributeValues = {
      ":lastUpdate": this._serializeDate(updateDate)
    };
    params.UpdateExpression = "REMOVE #" + prop + "[" + index + "] SET #lastUpdate = :lastUpdate";
    if (itemWriteCondition) {
      params.ExpressionAttributeValues[":condValue"] = itemWriteCondition;
      attrs["#condName"] = prop;
      attrs["#field"] = itemWriteConditionField;
      params.ConditionExpression = "#condName[" + index + "].#field = :condValue";
    }
    try {
      await this._client.update(params).promise();
    } catch (err) {
      if (err.code === "ConditionalCheckFailedException") {
        throw Error("UpdateCondition not met");
      }
      throw err;
    }
  }

  async _upsertItemToCollection(uid, prop, item, index, itemWriteCondition, itemWriteConditionField, updateDate: Date) {
    var params: any = {
      TableName: this._params.table,
      Key: {
        uuid: uid
      }
    };
    var attrValues = {};
    var attrs = {};
    attrs["#" + prop] = prop;
    attrs["#lastUpdate"] = this._lastUpdateField;
    attrValues[":" + prop] = this._cleanObject(item);
    attrValues[":lastUpdate"] = this._serializeDate(updateDate);
    params.ExpressionAttributeValues = attrValues;
    params.ExpressionAttributeNames = attrs;
    if (index === undefined) {
      params.UpdateExpression =
        "SET #" +
        prop +
        "= list_append(if_not_exists (#" +
        prop +
        ", :empty_list),:" +
        prop +
        "), #lastUpdate = :lastUpdate";
      attrValues[":" + prop] = [attrValues[":" + prop]];
      attrValues[":empty_list"] = [];
    } else {
      //attrs["#cond" + prop] += prop + "[" + index + "]." + itemWriteConditionField;
      params.UpdateExpression = "SET #" + prop + "[" + index + "] = :" + prop + ", #lastUpdate = :lastUpdate";
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
      if (err.code === "ConditionalCheckFailedException") {
        throw Error("UpdateCondition not met");
      }
      throw err;
    }
  }

  _getWriteCondition(writeCondition) {
    if (writeCondition instanceof Date) {
      writeCondition = this._serializeDate(writeCondition);
    }
    return this._lastUpdateField + " = " + writeCondition;
  }

  async _delete(uid, writeCondition = undefined) {
    var params: any = {
      TableName: this._params.table,
      Key: {
        uuid: uid
      }
    };
    if (writeCondition) {
      params.WriteCondition = this._getWriteCondition(writeCondition);
    }
    return this._client.delete(params).promise();
  }

  async _patch(object, uid, writeCondition = undefined) {
    object = this._cleanObject(object);
    var expr = "SET ";
    var sep = "";
    var attrValues = {};
    var attrs = {};
    var skipUpdate = true;
    var i = 1;
    for (var attr in object) {
      if (attr === "uuid" || object[attr] === undefined) {
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
      TableName: this._params.table,
      Key: {
        uuid: uid
      },
      UpdateExpression: expr,
      ExpressionAttributeValues: attrValues,
      ExpressionAttributeNames: attrs
    };
    // The Write Condition checks the value before writing
    if (writeCondition) {
      params.WriteCondition = this._getWriteCondition(writeCondition);
    }
    return this._client.update(params).promise();
  }

  async _update(object: any, uid: string, writeCondition = undefined) {
    object = this._cleanObject(object);
    object.uuid = uid;
    var params: any = {
      TableName: this._params.table,
      Item: object
    };
    // The Write Condition checks the value before writing
    if (writeCondition) {
      params.WriteCondition = this._getWriteCondition(writeCondition);
    }
    await this._client.put(params).promise();
    return object;
  }

  async _scan(items, paging = undefined) {
    return new Promise((resolve, reject) => {
      this._client.scan(
        {
          TableName: this._params.table,
          Limit: this._params.scanPage,
          ExclusiveStartKey: paging
        },
        (err, data) => {
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
        }
      );
    });
  }

  async getAll(uids) {
    if (!uids) {
      return this._scan([]);
    }
    var params = {
      RequestItems: {}
    };
    params["RequestItems"][this._params.table] = {
      Keys: uids.map(value => {
        return {
          uuid: value
        };
      })
    };
    let result = await this._client.batchGet(params).promise();
    return result.Responses[this._params.table].map(this.initModel, this);
  }

  async _get(uid) {
    var params = {
      TableName: this._params.table,
      Key: {
        uuid: uid
      }
    };
    return (await this._client.get(params).promise()).Item;
  }

  _incrementAttribute(uid, prop, value, updateDate: Date) {
    var params = {
      TableName: this._params.table,
      Key: {
        uuid: uid
      },
      UpdateExpression: "SET #a2 = :v2 ADD #a1 :v1",
      ExpressionAttributeValues: {
        ":v1": value,
        ":v2": this._serializeDate(updateDate)
      },
      ExpressionAttributeNames: {
        "#a1": prop,
        "#a2": this._lastUpdateField
      }
    };
    return this._client.update(params).promise();
  }

  getARNPolicy(accountId) {
    let region = this._params.region || "us-east-1";
    return {
      Sid: this.constructor.name + this._name,
      Effect: "Allow",
      Action: [
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
      Resource: ["arn:aws:dynamodb:" + region + ":" + accountId + ":table/" + this._params.table]
    };
  }

  async __clean() {
    var params = {
      TableName: this._params.table
    };
    let result = await this._client.scan(params).promise();
    var promises = [];
    for (var i in result.Items) {
      promises.push(this._delete(result.Items[i].uuid));
    }
    await Promise.all(promises);
    await this.createIndex();
  }

  getCloudFormation(deployer: CloudFormationDeployer) {
    if (this._params.CloudFormationSkip) {
      return {};
    }
    let resources = {};
    this._params.CloudFormation = this._params.CloudFormation || {};
    this._params.CloudFormation.Table = this._params.CloudFormation.Table || {};
    let KeySchema = this._params.CloudFormation.KeySchema || [{ KeyType: "HASH", AttributeName: "uuid" }];
    let AttributeDefinitions = this._params.CloudFormation.AttributeDefinitions || [];
    this._params.CloudFormation.Table.BillingMode = this._params.CloudFormation.Table.BillingMode || "PAY_PER_REQUEST";
    AttributeDefinitions.push({ AttributeName: "uuid", AttributeType: "S" });
    resources[this._name + "DynamoTable"] = {
      Type: "AWS::DynamoDB::Table",
      Properties: {
        ...this._params.CloudFormation.Table,
        TableName: this._params.table,
        KeySchema,
        AttributeDefinitions,
        Tags: deployer.getDefaultTags(this._params.CloudFormation.Table.Tags)
      }
    };
    // Add any Other resources with prefix of the service
    return resources;
  }

  static getModda(): ModdaDefinition {
    return {
      uuid: "Webda/DynamoStore",
      label: "DynamoStore",
      description: "Implements DynamoDB NoSQL storage",
      logo: "images/icons/dynamodb.png",
      documentation: "https://raw.githubusercontent.com/loopingz/webda/master/readmes/Store.md",
      configuration: {
        widget: {
          tag: "webda-dynamodb-configurator",
          url: "elements/services/webda-dynamodb-configurator.html"
        },
        schema: {
          type: "object",
          properties: {
            table: {
              type: "string",
              default: "table-name"
            },
            accessKeyId: {
              type: "string"
            },
            secretAccessKey: {
              type: "string"
            }
          },
          required: ["table", "accessKeyId", "secretAccessKey"]
        }
      }
    };
  }
}

export { DynamoStore };
