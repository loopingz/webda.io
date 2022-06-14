import {
  ConditionalCheckFailedException,
  DynamoDB,
  DynamoDBClient,
  QueryCommandOutput,
  ScanCommandOutput
} from "@aws-sdk/client-dynamodb";
import { DynamoDBDocument } from "@aws-sdk/lib-dynamodb";
import {
  CoreModel,
  Store,
  StoreFindResult,
  StoreNotFoundError,
  StoreParameters,
  UpdateConditionFailError,
  WebdaError,
  WebdaQL
} from "@webda/core";
import { WorkerOutput } from "@webda/workout";
import { CloudFormationDeployer } from "../deployers/cloudformation";
import { AWSServiceParameters, CloudFormationContributor } from "./index";

/**
 * Define DynamoDB parameters
 */
export class DynamoStoreParameters extends AWSServiceParameters(StoreParameters) {
  /**
   * Table name
   */
  table: string;
  /**
   * Additional global indexes
   */
  globalIndexes?: {
    [key: string]: {
      key: string;
      sort?: string;
    };
  };
  /**
   * CloudFormation customization
   */
  CloudFormation: any;
  CloudFormationSkip: boolean;
  scanPage: number;

  constructor(params: any, service: DynamoStore) {
    super(params, service);
    if (this.table === undefined) {
      throw new WebdaError("DYNAMODB_TABLE_PARAMETER_REQUIRED", "Need to define a table at least");
    }
    this.globalIndexes ??= {};
  }
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
 * @WebdaModda
 */
export default class DynamoStore<
    T extends CoreModel = CoreModel,
    K extends DynamoStoreParameters = DynamoStoreParameters
  >
  extends Store<T, K>
  implements CloudFormationContributor
{
  _client: DynamoDBDocument;

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
  resolve(): this {
    super.resolve();
    this._client = DynamoDBDocument.from(new DynamoDBClient(this.parameters), {
      marshallOptions: {
        removeUndefinedValues: true
      }
    });
    return this;
  }

  /**
   * Copy one DynamoDB table to another
   *
   * @param output
   * @param source
   * @param target
   */
  static async copyTable(output: WorkerOutput, source: string, target: string): Promise<void> {
    let db = new DynamoDB({});
    let ExclusiveStartKey;
    let props = await db.describeTable({
      TableName: source
    });
    output.startProgress("copyTable", props.Table.ItemCount, `Copying ${source} to ${target}`);
    do {
      let info = await db.scan({
        TableName: source,
        ExclusiveStartKey
      });
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
        await db.batchWriteItem(params);
        output.incrementProgress(items.length, "copyTable");
      } while (true);
      ExclusiveStartKey = info.LastEvaluatedKey;
    } while (ExclusiveStartKey);
  }

  /**
   * @inheritdoc
   */
  async exists(uid) {
    // Should use find + limit 1
    return (await this._get(uid)) !== undefined;
  }

  /**
   * @inheritdoc
   */
  async _save(object: any, uid: string = object.uuid) {
    return this._update(object, uid);
  }

  /**
   * @override
   *
   * @see https://docs.aws.amazon.com/amazondynamodb/latest/developerguide/Query.html
   * @see https://docs.aws.amazon.com/amazondynamodb/latest/developerguide/GSI.html
   */
  async find(query: WebdaQL.Query): Promise<StoreFindResult<T>> {
    let scan = true;
    let IndexName = undefined;
    let result: ScanCommandOutput | QueryCommandOutput;
    let primaryKeys = { uuid: null };
    Object.keys(this.parameters.globalIndexes).forEach(name => {
      primaryKeys[this.parameters.globalIndexes[name].key] = name;
    });
    // We could use PartQL but localstack is not compatible
    let filter: WebdaQL.AndExpression = new WebdaQL.AndExpression([]);
    let KeyConditionExpression = "";
    let ExpressionAttributeValues = {};
    let FilterExpression: string[] = [];
    let ExpressionAttributeNames = {};
    let indexNode;
    let sortOrder = "ASC";

    let processingExpression: WebdaQL.AndExpression;
    if (!(query.filter instanceof WebdaQL.AndExpression)) {
      processingExpression = new WebdaQL.AndExpression([query.filter]);
    } else {
      processingExpression = query.filter;
    }

    // Search for the index
    processingExpression.children.some(child => {
      if (child instanceof WebdaQL.ComparisonExpression) {
        // Primary key requires equal operator
        if (child.operator === "=" && primaryKeys[child.attribute[0]] !== undefined) {
          // Query not scan
          scan = false;
          IndexName = primaryKeys[child.attribute[0]];
          indexNode = child;
          KeyConditionExpression = `#${child.attribute[0]} = :${child.attribute[0]}`;
          ExpressionAttributeNames[`#${child.attribute[0]}`] = child.attribute[0];
          ExpressionAttributeValues[`:${child.attribute[0]}`] = child.value;
          if (
            primaryKeys[child.attribute[0]] !== null &&
            query.orderBy &&
            this.parameters.globalIndexes[primaryKeys[child.attribute[0]]].sort
          ) {
            const sortKey = this.parameters.globalIndexes[primaryKeys[child.attribute[0]]].sort;
            // Might update sort order
            query.orderBy.some(order => {
              if (order.field === sortKey) {
                sortOrder = order.direction;
              }
            });
          }
          return true;
        }
      }
    });
    let count = 1;
    // Build the Query/Filter
    processingExpression.children.forEach(child => {
      if (child === indexNode) {
        return;
      }
      // Only work on Comparison Node for now
      if (child instanceof WebdaQL.ComparisonExpression) {
        let operator = child.operator;
        // DynamoDB does not manage LIKE
        if (child.operator === "LIKE") {
          filter.children.push(child);
          return;
        }
        // != is <> in Dynamo
        if (operator === "!=") {
          operator = "<>";
        }
        // DynamoDB does not allow more than 100 items in IN
        if (child.operator === "IN" && (<any[]>child.value).length > 100) {
          filter.children.push(child);
          return;
        }

        // Subfields like team.id needs to be #a1.#a2
        let attr = `a${count++}`;
        let fullAttr = `#${attr}`;
        child.attribute.splice(1).forEach(v => {
          let subAttr = `#a${count++}`;
          fullAttr += `.${subAttr}`;
          ExpressionAttributeNames[subAttr] = v;
        });
        ExpressionAttributeNames[`#${attr}`] = child.attribute[0];

        let valueExpression = `:${attr}`;

        if (child.operator === "IN") {
          // Need to follow `a IN (b, c, d)
          valueExpression = "(" + valueExpression;
          ExpressionAttributeValues[`:${attr}`] = child.value[0];
          (<any[]>child.value).splice(1).forEach(v => {
            let subAttr = `:a${count++}`;
            valueExpression += `, ${subAttr}`;
            ExpressionAttributeValues[subAttr] = v;
          });
          valueExpression += ")";
        } else {
          // For all other just give the value
          ExpressionAttributeValues[`:${attr}`] = child.value;
        }

        // If this is a sort key
        if (IndexName && this.parameters.globalIndexes[IndexName].sort === child.attribute[0]) {
          // Sort key
          KeyConditionExpression += ` AND ${fullAttr} ${operator} ${valueExpression}`;
          return;
        }
        // Otherwise fallback to normal Filter
        FilterExpression.push(`${fullAttr} ${operator} ${valueExpression}`);
      } else {
        filter.children.push(child);
      }
    });

    if (!Object.keys(ExpressionAttributeNames).length) {
      ExpressionAttributeNames = undefined;
    }
    if (!Object.keys(ExpressionAttributeValues).length) {
      ExpressionAttributeValues = undefined;
    }
    const ExclusiveStartKey = query.continuationToken
      ? JSON.parse(Buffer.from(query.continuationToken, "base64").toString())
      : undefined;
    // Scan if not primary key was provided
    if (scan) {
      // SHould log bad query
      result = await this._client.scan({
        TableName: this.parameters.table,
        FilterExpression: FilterExpression.length ? FilterExpression.join(" AND ") : undefined,
        ExclusiveStartKey,
        ExpressionAttributeNames,
        ExpressionAttributeValues,
        Limit: query.limit
      });
    } else {
      result = await this._client.query({
        TableName: this.parameters.table,
        IndexName,
        ExclusiveStartKey,
        KeyConditionExpression,
        FilterExpression: FilterExpression.length ? FilterExpression.join(" AND ") : undefined,
        ExpressionAttributeNames,
        ExpressionAttributeValues,
        Limit: query.limit,
        ScanIndexForward: sortOrder === "ASC" ? true : false
      });
    }
    return {
      results: result.Items.map(c => this.initModel(c)),
      filter,
      continuationToken:
        result.Items.length >= query.limit
          ? Buffer.from(JSON.stringify(result.LastEvaluatedKey)).toString("base64")
          : undefined
    };
  }

  /**
   * Serialize a date for DynamoDB
   * @param date
   * @returns
   */
  _serializeDate(date: Date): string {
    return JSON.stringify(date).replace(/"/g, "");
  }

  /**
   * Clean object to store in DynamoDB
   *
   * @param object
   * @returns
   */
  _cleanObject(object: Object): any {
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

  /**
   * @inheritdoc
   */
  async _removeAttribute(uuid: string, attribute: string, itemWriteCondition?: any, itemWriteConditionField?: string) {
    var params: any = {
      TableName: this.parameters.table,
      Key: {
        uuid
      }
    };
    var attrs = {};
    attrs["#attr"] = attribute;
    attrs["#lastUpdate"] = this._lastUpdateField;
    params.ExpressionAttributeNames = attrs;
    params.ConditionExpression = "attribute_exists(#uu)";
    params.ExpressionAttributeValues = {
      ":lastUpdate": this._serializeDate(new Date())
    };
    params.UpdateExpression = "REMOVE #attr SET #lastUpdate = :lastUpdate";
    if (itemWriteCondition) {
      this.setWriteCondition(params, itemWriteCondition, itemWriteConditionField);
    } else {
      attrs["#uu"] = "uuid";
      params.ConditionExpression = "attribute_exists(#uu)";
    }

    try {
      await this._client.update(params);
    } catch (err) {
      if (err instanceof ConditionalCheckFailedException) {
        if (!itemWriteConditionField) {
          throw new StoreNotFoundError(uuid, this.getName());
        }
        throw new UpdateConditionFailError(uuid, itemWriteConditionField, itemWriteCondition);
      }
      throw err;
    }
  }

  /**
   * @inheritdoc
   */
  async _deleteItemFromCollection(uid, prop, index, itemWriteCondition, itemWriteConditionField, updateDate: Date) {
    var params: any = {
      TableName: this.parameters.table,
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
      await this._client.update(params);
    } catch (err) {
      if (err instanceof ConditionalCheckFailedException) {
        throw new UpdateConditionFailError(uid, itemWriteConditionField, itemWriteCondition);
      } else if (err.name === "ValidationException") {
        throw new StoreNotFoundError(uid, this.getName());
      }
      throw err;
    }
  }

  /**
   * @inheritdoc
   */
  async _upsertItemToCollection(
    uuid: string,
    prop: string,
    item: any,
    index: number | undefined,
    itemWriteCondition: any | undefined,
    itemWriteConditionField: string | undefined,
    updateDate: Date
  ) {
    var params: any = {
      TableName: this.parameters.table,
      Key: {
        uuid
      }
    };
    var attrValues = {};
    var attrs = {};
    attrs["#" + prop] = prop;
    attrs["#lastUpdate"] = this._lastUpdateField;

    attrValues[":" + prop] = this._cleanObject(item);
    attrValues[":lastUpdate"] = this._serializeDate(updateDate);

    attrValues[":uuid"] = uuid;
    attrs["#uuid"] = this._uuidField;
    params.ConditionExpression = "#uuid = :uuid";

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
      params.UpdateExpression = "SET #" + prop + "[" + index + "] = :" + prop + ", #lastUpdate = :lastUpdate";
      if (itemWriteCondition) {
        attrValues[":condValue"] = itemWriteCondition;
        attrs["#condName"] = prop;
        attrs["#field"] = itemWriteConditionField;
        params.ConditionExpression = "#condName[" + index + "].#field = :condValue and #uuid = :uuid";
      }
    }
    try {
      await this._client.update(params);
    } catch (err) {
      if (err instanceof ConditionalCheckFailedException) {
        throw new UpdateConditionFailError(uuid, itemWriteConditionField, itemWriteCondition);
      } else if (err.name === "ValidationException") {
        throw new StoreNotFoundError(uuid, this.getName());
      }
      throw err;
    }
  }

  /**
   * REturn the write condition as string
   * @param writeCondition
   * @param field
   * @returns
   */
  setWriteCondition(params: any, writeCondition: any, field: string = this._lastUpdateField): void {
    params.ExpressionAttributeNames ??= {};
    params.ExpressionAttributeValues ??= {};
    params.ExpressionAttributeNames["#cf"] = field;
    if (writeCondition instanceof Date) {
      writeCondition = this._serializeDate(writeCondition);
    }
    params.ExpressionAttributeValues[":cf"] = writeCondition;
    params.ConditionExpression = "#cf = :cf";
  }

  /**
   * @inheritdoc
   */
  async _delete(uid: string, writeCondition?: any, itemWriteConditionField?: string) {
    var params: any = {
      TableName: this.parameters.table,
      Key: {
        uuid: uid
      }
    };
    if (writeCondition) {
      this.setWriteCondition(params, writeCondition, itemWriteConditionField);
    }
    try {
      await this._client.delete(params);
    } catch (err) {
      if (err instanceof ConditionalCheckFailedException) {
        throw new UpdateConditionFailError(uid, itemWriteConditionField, writeCondition);
      }
      throw err;
    }
  }

  /**
   * @inheritdoc
   */
  async _patch(object: any, uid: string, itemWriteCondition?: any, itemWriteConditionField?: string) {
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
      TableName: this.parameters.table,
      Key: {
        uuid: uid
      },
      UpdateExpression: expr,
      ExpressionAttributeValues: attrValues,
      ExpressionAttributeNames: attrs
    };
    // The Write Condition checks the value before writing
    if (itemWriteCondition) {
      this.setWriteCondition(params, itemWriteCondition, itemWriteConditionField);
    }
    try {
      await this._client.update(params);
    } catch (err) {
      if (err instanceof ConditionalCheckFailedException) {
        throw new UpdateConditionFailError(uid, itemWriteConditionField, itemWriteCondition);
      }
      throw err;
    }
  }

  /**
   * @inheritdoc
   */
  async _update(object: any, uid: string, itemWriteCondition?: any, itemWriteConditionField?: string): Promise<any> {
    object = this._cleanObject(object);
    object.uuid = uid;
    var params: any = {
      TableName: this.parameters.table,
      Item: object
    };
    // The Write Condition checks the value before writing
    if (itemWriteCondition) {
      this.setWriteCondition(params, itemWriteCondition, itemWriteConditionField);
    }
    try {
      await this._client.put(params);
      return object;
    } catch (err) {
      if (err instanceof ConditionalCheckFailedException) {
        throw new UpdateConditionFailError(uid, itemWriteConditionField, itemWriteCondition);
      }
      throw err;
    }
  }

  /**
   * @inheritdoc
   */
  async _scan(items = [], paging = undefined): Promise<T[]> {
    let data = await this._client.scan({
      TableName: this.parameters.table,
      Limit: this.parameters.scanPage,
      ExclusiveStartKey: paging
    });
    for (let i in data.Items) {
      items.push(this.initModel(data.Items[i]));
    }
    if (data.LastEvaluatedKey) {
      return this._scan(items, data.LastEvaluatedKey);
    }
    return items;
  }

  /**
   * @inheritdoc
   */
  async getAll(uids?: string[]): Promise<T[]> {
    if (!uids) {
      return this._scan([]);
    }
    var params = {
      RequestItems: {}
    };
    params["RequestItems"][this.parameters.table] = {
      Keys: uids.map(value => {
        return {
          uuid: value
        };
      })
    };
    let result = await this._client.batchGet(params);
    return result.Responses[this.parameters.table].map(this.initModel, this);
  }

  /**
   * @inheritdoc
   */
  async _get(uid: string, raiseIfNotFound: boolean = false): Promise<T> {
    var params = {
      TableName: this.parameters.table,
      Key: {
        uuid: uid
      }
    };
    let item = (await this._client.get(params)).Item;
    if (!item) {
      if (raiseIfNotFound) {
        throw new StoreNotFoundError(uid, this.getName());
      }
      return undefined;
    }
    return this.initModel(item);
  }

  /**
   * @inheritdoc
   */
  async _incrementAttribute(uid, prop, value, updateDate: Date) {
    var params = {
      TableName: this.parameters.table,
      Key: {
        uuid: uid
      },
      UpdateExpression: "SET #a2 = :v2 ADD #a1 :v1",
      ConditionExpression: "attribute_exists(#uu)",
      ExpressionAttributeValues: {
        ":v1": value,
        ":v2": this._serializeDate(updateDate)
      },
      ExpressionAttributeNames: {
        "#a1": prop,
        "#a2": this._lastUpdateField,
        "#uu": "uuid"
      }
    };
    try {
      return await this._client.update(params);
    } catch (err) {
      if (err instanceof ConditionalCheckFailedException) {
        throw new StoreNotFoundError(uid, this.getName());
      }
      throw err;
    }
  }

  /**
   * @inheritdoc
   */
  getARNPolicy(accountId: string) {
    let region = this.parameters.region || "us-east-1";
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
      Resource: ["arn:aws:dynamodb:" + region + ":" + accountId + ":table/" + this.parameters.table]
    };
  }

  /**
   * @inheritdoc
   */
  async __clean() {
    var params = {
      TableName: this.parameters.table
    };
    let result = await this._client.scan(params);
    var promises = [];
    for (var i in result.Items) {
      promises.push(this._delete(result.Items[i].uuid));
    }
    await Promise.all(promises);
  }

  /**
   * @inheritdoc
   */
  getCloudFormation(deployer: CloudFormationDeployer) {
    if (this.parameters.CloudFormationSkip) {
      return {};
    }
    let resources = {};
    this.parameters.CloudFormation = this.parameters.CloudFormation || {};
    this.parameters.CloudFormation.Table = this.parameters.CloudFormation.Table || {};
    let KeySchema = this.parameters.CloudFormation.KeySchema || [{ KeyType: "HASH", AttributeName: "uuid" }];
    let AttributeDefinitions = this.parameters.CloudFormation.AttributeDefinitions || [];
    this.parameters.CloudFormation.Table.BillingMode =
      this.parameters.CloudFormation.Table.BillingMode || "PAY_PER_REQUEST";
    AttributeDefinitions.push({ AttributeName: "uuid", AttributeType: "S" });
    resources[this._name + "DynamoTable"] = {
      Type: "AWS::DynamoDB::Table",
      Properties: {
        ...this.parameters.CloudFormation.Table,
        TableName: this.parameters.table,
        KeySchema,
        AttributeDefinitions,
        Tags: deployer.getDefaultTags(this.parameters.CloudFormation.Table.Tags)
      }
    };
    // Add any Other resources with prefix of the service
    return resources;
  }
}

export { DynamoStore };
