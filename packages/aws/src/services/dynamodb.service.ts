import {
  ConditionalCheckFailedException,
  DynamoDB,
  DynamoDBClient,
  QueryCommandOutput,
  ScanCommandOutput
} from "@aws-sdk/client-dynamodb";
import { DynamoDBDocument } from "@aws-sdk/lib-dynamodb";
import {
  EventRepository,
  InstanceCache,
  MemoryRepository,
  Store,
  StoreNotFoundError,
  StoreParameters,
  UpdateConditionFailError,
  useModel,
  useModelMetadata,
  WebdaError
} from "@webda/core";
import type { ModelClass, Repository } from "@webda/core";
import * as WebdaQL from "@webda/ql";
import { WorkerOutput } from "@webda/workout";
import { AWSServiceParameters, loadAWSParameters } from "./aws-parameters.js";
import type { CloudFormationContributor, CloudFormationDeployerInfo } from "./contributors.js";

/**
 * Name of the DynamoDB hash key attribute
 */
const KEY_ATTRIBUTE = "uuid";
/**
 * Attribute storing the model identifier, used to rebuild subclasses
 */
const TYPE_ATTRIBUTE = "__type";

/**
 * DynamoDB global secondary indexes definition
 */
export interface DynamoGlobalIndexes {
  [key: string]: {
    /**
     * Hash key of the index
     */
    key: string;
    /**
     * Range key of the index
     */
    sort?: string;
  };
}

/**
 * Define DynamoDB parameters
 */
export class DynamoStoreParameters extends StoreParameters implements AWSServiceParameters {
  /**
   * Custom endpoint (localstack, minio, ...)
   */
  endpoint?: string;
  /**
   * Static credentials, default to the AWS environment variables
   */
  credentials?: { accessKeyId: string; secretAccessKey: string; sessionToken?: string };
  /**
   * AWS region
   * @default "us-east-1"
   */
  region?: string;

  /**
   * Table name
   */
  table: string;
  /**
   * Per-model table name overrides, keyed by model identifier
   *
   * Models not listed use `table`
   */
  tables?: { [modelIdentifier: string]: string };
  /**
   * Additional global indexes
   */
  globalIndexes?: DynamoGlobalIndexes;
  /**
   * CloudFormation customization
   */
  CloudFormation?: any;
  /**
   * Skip CloudFormation on deploy
   */
  CloudFormationSkip?: boolean;
  /**
   * Number of items to retrieve per scan page
   */
  scanPage?: number;

  /**
   * @override
   * @param params - raw parameters
   * @returns this
   */
  load(params: any = {}): this {
    super.load(params);
    loadAWSParameters(this);
    if (this.table === undefined) {
      throw new WebdaError.CodeError("DYNAMODB_TABLE_PARAMETER_REQUIRED", "Need to define a table at least");
    }
    this.globalIndexes ??= {};
    this.tables ??= {};
    return this;
  }
}

/**
 * Result of a DynamoDB find before applying the residual filter
 */
export interface DynamoFindResult<T> {
  /**
   * Items returned by DynamoDB
   */
  results: T[];
  /**
   * Part of the query that DynamoDB cannot evaluate
   */
  filter: WebdaQL.Expression;
  /**
   * Next page token
   */
  continuationToken?: string;
}

/**
 * Serialize a date for DynamoDB
 * @param date - the date to serialize
 * @returns ISO string
 */
function serializeDate(date: Date): string {
  return date.toISOString();
}

/**
 * Clean an object to store in DynamoDB
 *
 * Dates are converted to ISO strings, empty strings and undefined values are removed
 *
 * @param object - the value to clean
 * @returns the cleaned value
 */
export function cleanObject(object: any): any {
  if (object === null || typeof object !== "object") return object;
  if (object instanceof Date) {
    return serializeDate(object);
  }
  if (typeof object.toJSON === "function" && !Array.isArray(object)) {
    const json = object.toJSON();
    if (json !== object) {
      return cleanObject(json);
    }
  }
  const res: any = Array.isArray(object) ? [] : {};
  for (const i in object) {
    if (object[i] === "" || object[i] === undefined || typeof object[i] === "function") {
      continue;
    }
    res[i] = cleanObject(object[i]);
  }
  return res;
}

/**
 * DynamoDB-backed repository for a single model class
 *
 * Every object is stored as one item, keyed by the string primary key in the
 * `uuid` hash key attribute.
 */
export class DynamoRepository<T extends ModelClass> extends MemoryRepository<T> {
  /**
   * Create a new DynamoRepository
   * @param model - the model class
   * @param pks - primary key field names
   * @param client - the DynamoDB document client
   * @param table - the table name
   * @param globalIndexes - global secondary indexes usable by queries
   * @param scanPage - scan page size used by __clean
   * @param storeName - store name used in errors
   * @param separator - primary key separator
   */
  constructor(
    model: T,
    pks: string[],
    protected readonly client: DynamoDBDocument,
    protected readonly table: string,
    protected readonly globalIndexes: DynamoGlobalIndexes = {},
    protected readonly scanPage?: number,
    protected readonly storeName: string = table,
    separator?: string
  ) {
    // Pass an empty Map — we do NOT use in-memory storage
    super(model, pks, separator, new Map<string, string>() as any);
  }

  /**
   * The backing table name
   * @returns the table name
   */
  getTable(): string {
    return this.table;
  }

  /**
   * Return the DynamoDB key of an object or primary key
   * @param primaryKey - the object or primary key
   * @returns the string key
   */
  protected getKey(primaryKey: any): string {
    return this.getPrimaryKey(primaryKey).toString();
  }

  /**
   * Convert a model or plain object to a DynamoDB item
   * @param data - the object to convert
   * @returns the item
   */
  toItem(data: any): any {
    const item = cleanObject(data);
    item[KEY_ATTRIBUTE] = this.getKey(data);
    item[TYPE_ATTRIBUTE] = (data as any)?.constructor?.Metadata?.Identifier ?? (this.model as any).Metadata?.Identifier;
    if (item[TYPE_ATTRIBUTE] === undefined) {
      delete item[TYPE_ATTRIBUTE];
    }
    return item;
  }

  /**
   * Convert a DynamoDB item to a model instance
   *
   * The `__type` attribute is used to instantiate the right subclass
   * @param item - the DynamoDB item
   * @returns the model instance
   */
  fromItem(item: any): InstanceType<T> {
    const data = { ...item };
    let model: ModelClass = this.model;
    const type = data[TYPE_ATTRIBUTE];
    delete data[TYPE_ATTRIBUTE];
    if (type && type !== (this.model as any).Metadata?.Identifier) {
      try {
        model = useModel(type) ?? this.model;
      } catch {
        model = this.model;
      }
    }
    if (!this.pks.includes(KEY_ATTRIBUTE)) {
      delete data[KEY_ATTRIBUTE];
    }
    const instance = new (model as any)({}) as InstanceType<T>;
    if (typeof (instance as any).load === "function") {
      (instance as any).load(data);
    } else {
      Object.assign(instance as any, data);
    }
    if (type) {
      Object.defineProperty(instance, TYPE_ATTRIBUTE, {
        value: type,
        enumerable: false,
        configurable: true,
        writable: true
      });
    }
    return instance;
  }

  /**
   * Add a write condition to the DynamoDB parameters
   * @param params - the DynamoDB parameters
   * @param writeCondition - the expected value
   * @param field - the field to check
   */
  setWriteCondition(params: any, writeCondition: any, field: string): void {
    params.ExpressionAttributeNames ??= {};
    params.ExpressionAttributeValues ??= {};
    params.ExpressionAttributeNames["#cf"] = field;
    if (writeCondition instanceof Date) {
      writeCondition = serializeDate(writeCondition);
    }
    params.ExpressionAttributeValues[":cf"] = writeCondition;
    params.ConditionExpression = params.ConditionExpression
      ? `${params.ConditionExpression} AND #cf = :cf`
      : "#cf = :cf";
  }

  /**
   * Build a document path expression for an attribute like `team.id`
   * @param attribute - the attribute path
   * @param names - expression attribute names to fill
   * @param prefix - placeholder prefix
   * @returns the path expression
   */
  protected attributePath(attribute: string, names: any, prefix: string): string {
    return attribute
      .split(".")
      .map((part, i) => {
        names[`#${prefix}${i}`] = part;
        return `#${prefix}${i}`;
      })
      .join(".");
  }

  /** @override */
  async get(primaryKey: any): Promise<any> {
    const key = this.getKey(primaryKey);
    const item = (
      await this.client.get({
        TableName: this.table,
        Key: { [KEY_ATTRIBUTE]: key }
      })
    ).Item;
    if (!item) {
      throw new StoreNotFoundError(key as any, this.storeName);
    }
    return this.fromItem(item);
  }

  /** @override */
  async exists(primaryKey: any): Promise<boolean> {
    const item = (
      await this.client.get({
        TableName: this.table,
        Key: { [KEY_ATTRIBUTE]: this.getKey(primaryKey) },
        ProjectionExpression: "#k",
        ExpressionAttributeNames: { "#k": KEY_ATTRIBUTE }
      })
    ).Item;
    return item !== undefined;
  }

  /** @override */
  async create(data: any, save: boolean = true): Promise<any> {
    // Build once so a generated primary key is kept (and not reset by an undefined one in data)
    const item = this.buildItem(data);
    if (save === false) {
      return item;
    }
    const key = this.getKey(item);
    try {
      await this.client.put({
        TableName: this.table,
        Item: this.toItem(item),
        ConditionExpression: "attribute_not_exists(#k)",
        ExpressionAttributeNames: { "#k": KEY_ATTRIBUTE }
      });
    } catch (err) {
      if (err instanceof ConditionalCheckFailedException) {
        throw new Error(`Already exists: ${key}`);
      }
      throw err;
    }
    return item;
  }

  /** @override */
  async update(data: any, conditionField?: any, condition?: any): Promise<void> {
    const key = this.getKey(data);
    const params: any = {
      TableName: this.table,
      Item: this.toItem(data),
      ConditionExpression: "attribute_exists(#k)",
      ExpressionAttributeNames: { "#k": KEY_ATTRIBUTE }
    };
    if (conditionField) {
      this.setWriteCondition(params, condition, conditionField);
    }
    try {
      await this.client.put(params);
    } catch (err) {
      if (err instanceof ConditionalCheckFailedException) {
        if (!conditionField) {
          throw new StoreNotFoundError(key as any, this.storeName);
        }
        throw new UpdateConditionFailError(key as any, conditionField, condition);
      }
      throw err;
    }
  }

  /** @override */
  async patch(primaryKey: any, data: any, conditionField?: any, condition?: any): Promise<void> {
    const key = this.getKey(primaryKey);
    const object = cleanObject(data);
    const sets: string[] = [];
    const ExpressionAttributeValues = {};
    const ExpressionAttributeNames = { "#k": KEY_ATTRIBUTE };
    let i = 1;
    for (const attr in object) {
      if (attr === KEY_ATTRIBUTE || this.pks.includes(attr) || object[attr] === undefined) {
        continue;
      }
      sets.push(`#a${i} = :v${i}`);
      ExpressionAttributeValues[`:v${i}`] = object[attr];
      ExpressionAttributeNames[`#a${i}`] = attr;
      i++;
    }
    if (!sets.length) {
      return;
    }
    const params: any = {
      TableName: this.table,
      Key: { [KEY_ATTRIBUTE]: key },
      UpdateExpression: "SET " + sets.join(", "),
      ConditionExpression: "attribute_exists(#k)",
      ExpressionAttributeValues,
      ExpressionAttributeNames
    };
    // The Write Condition checks the value before writing
    if (conditionField) {
      this.setWriteCondition(params, condition, conditionField);
    }
    try {
      await this.client.update(params);
    } catch (err) {
      if (err instanceof ConditionalCheckFailedException) {
        if (!conditionField) {
          throw new StoreNotFoundError(key as any, this.storeName);
        }
        throw new UpdateConditionFailError(key as any, conditionField, condition);
      }
      throw err;
    }
  }

  /** @override */
  async delete(primaryKey: any, conditionField?: any, condition?: any): Promise<void> {
    const key = this.getKey(primaryKey);
    const params: any = {
      TableName: this.table,
      Key: { [KEY_ATTRIBUTE]: key }
    };
    if (conditionField) {
      this.setWriteCondition(params, condition, conditionField);
    }
    try {
      await this.client.delete(params);
    } catch (err) {
      if (err instanceof ConditionalCheckFailedException) {
        throw new UpdateConditionFailError(key as any, conditionField, condition);
      }
      throw err;
    }
  }

  /** @override */
  async removeAttribute(primaryKey: any, attribute: any, conditionField?: any, condition?: any): Promise<void> {
    const key = this.getKey(primaryKey);
    const ExpressionAttributeNames = { "#k": KEY_ATTRIBUTE };
    const params: any = {
      TableName: this.table,
      Key: { [KEY_ATTRIBUTE]: key },
      UpdateExpression: `REMOVE ${this.attributePath(String(attribute), ExpressionAttributeNames, "r")}`,
      ConditionExpression: "attribute_exists(#k)",
      ExpressionAttributeNames
    };
    if (conditionField) {
      this.setWriteCondition(params, condition, conditionField);
    }
    try {
      await this.client.update(params);
    } catch (err) {
      if (err instanceof ConditionalCheckFailedException) {
        if (!conditionField) {
          throw new StoreNotFoundError(key as any, this.storeName);
        }
        throw new UpdateConditionFailError(key as any, conditionField, condition);
      }
      throw err;
    }
  }

  /** @override */
  async incrementAttributes(primaryKey: any, info: any, conditionField?: any, condition?: any): Promise<void> {
    const key = this.getKey(primaryKey);
    const entries: Array<{ property: string; value: number }> = Array.isArray(info)
      ? info.map((e: any) =>
          typeof e === "string" ? { property: e, value: 1 } : { property: e.property, value: e.value ?? 1 }
        )
      : Object.entries(info).map(([property, value]) => ({ property: String(property), value: value as number }));
    if (!entries.length) {
      return;
    }
    const ExpressionAttributeNames = { "#k": KEY_ATTRIBUTE };
    const ExpressionAttributeValues = {};
    const adds = entries.map((p, i) => {
      ExpressionAttributeValues[`:v${i}`] = p.value;
      return `${this.attributePath(p.property, ExpressionAttributeNames, `a${i}_`)} :v${i}`;
    });
    const params: any = {
      TableName: this.table,
      Key: { [KEY_ATTRIBUTE]: key },
      UpdateExpression: "ADD " + adds.join(", "),
      ConditionExpression: "attribute_exists(#k)",
      ExpressionAttributeValues,
      ExpressionAttributeNames
    };
    if (conditionField) {
      this.setWriteCondition(params, condition, conditionField);
    }
    try {
      await this.client.update(params);
    } catch (err) {
      if (err instanceof ConditionalCheckFailedException) {
        if (!conditionField) {
          throw new StoreNotFoundError(key as any, this.storeName);
        }
        throw new UpdateConditionFailError(key as any, conditionField, condition);
      }
      throw err;
    }
  }

  /** @override */
  async upsertItemToCollection(
    primaryKey: any,
    collection: any,
    item: any,
    index?: number,
    itemWriteConditionField?: any,
    itemWriteCondition?: any
  ): Promise<void> {
    const key = this.getKey(primaryKey);
    const prop = String(collection);
    const ExpressionAttributeNames: any = { "#k": KEY_ATTRIBUTE, "#col": prop };
    const ExpressionAttributeValues: any = {};
    const params: any = {
      TableName: this.table,
      Key: { [KEY_ATTRIBUTE]: key },
      ConditionExpression: "attribute_exists(#k)",
      ExpressionAttributeNames,
      ExpressionAttributeValues
    };
    if (index === undefined) {
      params.UpdateExpression = "SET #col = list_append(if_not_exists(#col, :empty_list), :item)";
      ExpressionAttributeValues[":item"] = [cleanObject(item)];
      ExpressionAttributeValues[":empty_list"] = [];
    } else {
      params.UpdateExpression = `SET #col[${index}] = :item`;
      ExpressionAttributeValues[":item"] = cleanObject(item);
      if (itemWriteCondition !== undefined) {
        ExpressionAttributeValues[":condValue"] = itemWriteCondition;
        ExpressionAttributeNames["#field"] = itemWriteConditionField;
        params.ConditionExpression += ` AND #col[${index}].#field = :condValue`;
      }
    }
    try {
      await this.client.update(params);
    } catch (err) {
      if (err instanceof ConditionalCheckFailedException) {
        if (itemWriteCondition === undefined) {
          throw new StoreNotFoundError(key as any, this.storeName);
        }
        throw new UpdateConditionFailError(key as any, itemWriteConditionField, itemWriteCondition);
      } else if (err.name === "ValidationException") {
        throw new StoreNotFoundError(key as any, this.storeName);
      }
      throw err;
    }
  }

  /** @override */
  async deleteItemFromCollection(
    primaryKey: any,
    collection: any,
    index: number,
    itemWriteConditionField?: any,
    itemWriteCondition?: any
  ): Promise<void> {
    const key = this.getKey(primaryKey);
    const ExpressionAttributeNames: any = { "#k": KEY_ATTRIBUTE, "#col": String(collection) };
    const params: any = {
      TableName: this.table,
      Key: { [KEY_ATTRIBUTE]: key },
      UpdateExpression: `REMOVE #col[${index}]`,
      ConditionExpression: "attribute_exists(#k)",
      ExpressionAttributeNames
    };
    if (itemWriteCondition !== undefined) {
      params.ExpressionAttributeValues = { ":condValue": itemWriteCondition };
      ExpressionAttributeNames["#field"] = itemWriteConditionField;
      params.ConditionExpression += ` AND #col[${index}].#field = :condValue`;
    }
    try {
      await this.client.update(params);
    } catch (err) {
      if (err instanceof ConditionalCheckFailedException) {
        if (itemWriteCondition === undefined) {
          throw new StoreNotFoundError(key as any, this.storeName);
        }
        throw new UpdateConditionFailError(key as any, itemWriteConditionField, itemWriteCondition);
      } else if (err.name === "ValidationException") {
        throw new StoreNotFoundError(key as any, this.storeName);
      }
      throw err;
    }
  }

  /**
   * Translate a WebdaQL query into a DynamoDB scan or query
   *
   * A query on the hash key or on a global index hash key with `=` uses a DynamoDB Query,
   * anything else is a Scan. The part of the expression DynamoDB cannot evaluate is
   * returned in `filter` and must be applied on the results.
   *
   * @see https://docs.aws.amazon.com/amazondynamodb/latest/developerguide/Query.html
   * @see https://docs.aws.amazon.com/amazondynamodb/latest/developerguide/GSI.html
   * @param query - the parsed query
   * @returns the items and the residual filter
   */
  async find(query: WebdaQL.Query): Promise<DynamoFindResult<InstanceType<T>>> {
    let scan = true;
    let IndexName = undefined;
    let result: ScanCommandOutput | QueryCommandOutput;
    const limit = query.limit ?? 1000;
    const primaryKeys = { [KEY_ATTRIBUTE]: null };
    Object.keys(this.globalIndexes).forEach(name => {
      primaryKeys[this.globalIndexes[name].key] = name;
    });
    // We could use PartQL but localstack is not compatible
    const filter: WebdaQL.AndExpression = new WebdaQL.AndExpression([]);
    let KeyConditionExpression = "";
    let ExpressionAttributeValues = {};
    const FilterExpression: string[] = [];
    let ExpressionAttributeNames = {};
    let indexNode;
    let sortOrder = "ASC";

    let processingExpression: WebdaQL.AndExpression;
    if (!(query.filter instanceof WebdaQL.AndExpression)) {
      processingExpression = new WebdaQL.AndExpression([query.filter]);
    } else {
      processingExpression = query.filter;
    }
    // A FALSE conjunct matches nothing: do not hit DynamoDB (never fail open)
    if (processingExpression.children.some(c => c instanceof WebdaQL.BooleanExpression && !c.value)) {
      return { results: [], filter, continuationToken: undefined };
    }
    // A TRUE conjunct is neutral
    processingExpression = new WebdaQL.AndExpression(
      processingExpression.children.filter(c => !(c instanceof WebdaQL.BooleanExpression))
    );

    // Search for the index
    processingExpression.children.some(child => {
      if (child instanceof WebdaQL.ComparisonExpression) {
        // Primary key requires equal operator
        if (child.operator === "=" && child.attribute.length === 1 && primaryKeys[child.attribute[0]] !== undefined) {
          // Query not scan
          scan = false;
          IndexName = primaryKeys[child.attribute[0]] ?? undefined;
          indexNode = child;
          KeyConditionExpression = `#${child.attribute[0]} = :${child.attribute[0]}`;
          ExpressionAttributeNames[`#${child.attribute[0]}`] = child.attribute[0];
          ExpressionAttributeValues[`:${child.attribute[0]}`] = child.value;
          if (IndexName && query.orderBy && this.globalIndexes[IndexName].sort) {
            const sortKey = this.globalIndexes[IndexName].sort;
            // Might update sort order
            query.orderBy.forEach(order => {
              if (order.field === sortKey) {
                sortOrder = order.direction;
              }
            });
          }
          return true;
        }
      }
      return false;
    });
    let count = 1;
    // Build the Query/Filter
    processingExpression.children.forEach(child => {
      if (child === indexNode) {
        return;
      }
      // Only work on Comparison Node for now
      if (child instanceof WebdaQL.ComparisonExpression) {
        let operator: string = child.operator;
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
        const isSortKey = IndexName && this.globalIndexes[IndexName].sort === child.attribute[0];
        // A sort key cannot be used in a filter expression and IN is not allowed in a key condition
        if (isSortKey && child.operator === "IN") {
          filter.children.push(child);
          return;
        }
        // Function conditions (IS NULL / IS NOT NULL) are not allowed on a sort key either
        if (isSortKey && (child.operator === "IS NULL" || child.operator === "IS NOT NULL")) {
          filter.children.push(child);
          return;
        }

        // Subfields like team.id needs to be #a1.#a2
        const attr = `a${count++}`;
        let fullAttr = `#${attr}`;
        child.attribute.slice(1).forEach(v => {
          const subAttr = `#a${count++}`;
          fullAttr += `.${subAttr}`;
          ExpressionAttributeNames[subAttr] = v;
        });
        ExpressionAttributeNames[`#${attr}`] = child.attribute[0];

        // IS NULL matches a missing attribute or one stored with the NULL type (JS null).
        // Empty strings are not stored (see cleanObject), so they also match IS NULL here.
        if (child.operator === "IS NULL" || child.operator === "IS NOT NULL") {
          ExpressionAttributeValues[`:${attr}`] = "NULL";
          FilterExpression.push(
            child.operator === "IS NULL"
              ? `(attribute_not_exists(${fullAttr}) OR attribute_type(${fullAttr}, :${attr}))`
              : `(attribute_exists(${fullAttr}) AND NOT attribute_type(${fullAttr}, :${attr}))`
          );
          return;
        }

        let valueExpression = `:${attr}`;

        if (child.operator === "IN") {
          // Need to follow `a IN (b, c, d)
          valueExpression = "(" + valueExpression;
          ExpressionAttributeValues[`:${attr}`] = child.value[0];
          (<any[]>child.value).slice(1).forEach(v => {
            const subAttr = `:a${count++}`;
            valueExpression += `, ${subAttr}`;
            ExpressionAttributeValues[subAttr] = v;
          });
          valueExpression += ")";
        } else {
          // For all other just give the value
          ExpressionAttributeValues[`:${attr}`] = child.value;
        }

        // Manage CONTAINS
        if (child.operator === "CONTAINS") {
          FilterExpression.push(`contains(${fullAttr}, :${attr})`);
          return;
        }

        // If this is a sort key
        if (isSortKey) {
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
    let ExclusiveStartKey = query.continuationToken
      ? JSON.parse(Buffer.from(query.continuationToken, "base64").toString())
      : undefined;
    // Scan if not primary key was provided
    if (scan) {
      const Items = [];
      do {
        result = await this.client.scan({
          TableName: this.table,
          FilterExpression: FilterExpression.length ? FilterExpression.join(" AND ") : undefined,
          ExclusiveStartKey,
          ExpressionAttributeNames,
          ExpressionAttributeValues,
          Limit: limit - Items.length
        });
        Items.push(...result.Items);
        result.Items = Items;
        ExclusiveStartKey = result.LastEvaluatedKey;
      } while (Items.length < limit && result.LastEvaluatedKey);
    } else {
      result = await this.client.query({
        TableName: this.table,
        IndexName,
        ExclusiveStartKey,
        KeyConditionExpression,
        FilterExpression: FilterExpression.length ? FilterExpression.join(" AND ") : undefined,
        ExpressionAttributeNames,
        ExpressionAttributeValues,
        Limit: limit,
        ScanIndexForward: sortOrder === "ASC"
      });
    }
    return {
      results: result.Items.map(c => this.fromItem(c)),
      filter,
      continuationToken: result.LastEvaluatedKey
        ? Buffer.from(JSON.stringify(result.LastEvaluatedKey)).toString("base64")
        : undefined
    };
  }

  /**
   * Delete in bulk: the generic fallback (matching keys collected up to LIMIT, then deleted one by one with
   * this repository's `delete`), no per-object event. A native DynamoDB batch write is a follow-up.
   * @override
   */
  async deleteMany(statement: string | WebdaQL.Query, params?: WebdaQL.QueryParameters): Promise<number> {
    return this.deleteManyByKey(statement, params);
  }

  /**
   * Update in bulk: the generic fallback (matching keys collected up to LIMIT, then patched one by one with
   * this repository's `patch`), no per-object event. A native DynamoDB batch write is a follow-up.
   * @override
   */
  async updateMany(statement: string | WebdaQL.Query, params?: WebdaQL.QueryParameters): Promise<number> {
    return this.updateManyByKey(statement, params);
  }

  /**
   * Query the table
   *
   * Pages are retrieved until the limit is reached, applying the part of the
   * filter that DynamoDB cannot evaluate and restricting to the model hierarchy
   * @override
   * @param query - the WebdaQL query
   * @returns the results and the continuation token
   */
  async query(query: string | any): Promise<{ results: InstanceType<T>[]; continuationToken?: string }> {
    // A query object built or changed by code goes back through the grammar before reaching the backend
    const parsed: WebdaQL.Query = typeof query === "string" ? WebdaQL.parse(query) : WebdaQL.normalizeQuery(query);
    // DELETE / UPDATE go to deleteMany / updateMany; a field list is not a projection here
    WebdaQL.assertFilterQuery(parsed);
    const limit = parsed.limit ?? 1000;
    const ids = this.buildClassFilterIdentifiers();
    const results: InstanceType<T>[] = [];
    let continuationToken = parsed.continuationToken;
    do {
      const page = await this.find({
        ...parsed,
        filter: parsed.filter,
        limit: limit - results.length,
        continuationToken
      } as WebdaQL.Query);
      results.push(
        ...page.results.filter(item => {
          const type = (item as any)[TYPE_ATTRIBUTE];
          if (ids && type && !ids.includes(type)) {
            return false;
          }
          return page.filter.eval(item);
        })
      );
      continuationToken = page.continuationToken;
    } while (results.length < limit && continuationToken);
    return {
      results,
      continuationToken: results.length >= limit ? continuationToken : undefined
    };
  }

  /**
   * Iterate over the query results
   * @override
   * @param query - the WebdaQL query
   */
  async *iterate(query: string): AsyncGenerator<InstanceType<T>, any, any> {
    const parsed: WebdaQL.Query = WebdaQL.parse(query);
    WebdaQL.assertFilterQuery(parsed);
    if (!parsed.limit) {
      parsed.limit = 100;
    }
    do {
      const res = await this.query(parsed);
      for (const item of res.results) {
        yield item;
      }
      parsed.continuationToken = res.continuationToken;
    } while (parsed.continuationToken);
  }

  /**
   * Delete all items from the table (used in tests)
   */
  async __clean(): Promise<void> {
    let ExclusiveStartKey;
    do {
      const result = await this.client.scan({
        TableName: this.table,
        Limit: this.scanPage,
        ExclusiveStartKey
      });
      await Promise.all(
        (result.Items ?? []).map(item =>
          this.client.delete({ TableName: this.table, Key: { [KEY_ATTRIBUTE]: item[KEY_ATTRIBUTE] } })
        )
      );
      ExclusiveStartKey = result.LastEvaluatedKey;
    } while (ExclusiveStartKey);
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
 * The table must have a `uuid` string hash key
 *
 * @WebdaModda
 */
export class DynamoStore<K extends DynamoStoreParameters = DynamoStoreParameters>
  extends Store<K>
  implements CloudFormationContributor
{
  _client: DynamoDBDocument;

  /**
   * Create the AWS client
   * @returns this
   */
  resolve(): this {
    super.resolve();
    this._client = DynamoDBDocument.from(new DynamoDBClient(this.parameters), {
      marshallOptions: {
        removeUndefinedValues: true,
        convertClassInstanceToMap: true
      }
    });
    return this;
  }

  /**
   * Copy one DynamoDB table to another
   *
   * @param output - worker output to report progress
   * @param source - source table
   * @param target - target table
   */
  static async copyTable(output: WorkerOutput, source: string, target: string): Promise<void> {
    const db = new DynamoDB({});
    let ExclusiveStartKey;
    const props = await db.describeTable({
      TableName: source
    });
    output.startProgress("copyTable", props.Table.ItemCount, `Copying ${source} to ${target}`);
    do {
      const info = await db.scan({
        TableName: source,
        ExclusiveStartKey
      });
      do {
        const items = [];
        while (info.Items.length && items.length < 25) {
          items.push(info.Items.shift());
        }
        if (!items.length) {
          break;
        }
        await db.batchWriteItem({
          RequestItems: {
            [target]: items.map(Item => ({
              PutRequest: { Item }
            }))
          }
        });
        output.incrementProgress(items.length, "copyTable");
      } while (true);
      ExclusiveStartKey = info.LastEvaluatedKey;
    } while (ExclusiveStartKey);
  }

  /**
   * Resolve the table name for a given model class
   *
   * `tables[identifier]` overrides the default `table`
   * @param model - the model class
   * @returns the table name
   */
  resolveTable(model: ModelClass): string {
    const meta = useModelMetadata(model);
    return (meta && this.parameters.tables?.[meta.Identifier]) || this.parameters.table;
  }

  /**
   * Build the DynamoRepository for a model
   *
   * The result is cached per model class
   * @param model - the model class
   * @returns a repository backed by this store's DynamoDB table
   */
  @InstanceCache()
  getRepository<T extends ModelClass>(model: T): Repository<T> {
    const meta = useModelMetadata(model);
    const inner = new DynamoRepository<T>(
      model,
      meta.PrimaryKey,
      this._client,
      this.resolveTable(model),
      this.parameters.globalIndexes,
      this.parameters.scanPage,
      this.getName(),
      meta.PrimaryKeySeparator
    );
    // Wrap in EventRepository so typed CRUD events fire; consumers reach them
    // via useRepository(model).on(...).
    return new EventRepository<T>(model, meta.PrimaryKey, inner, meta.PrimaryKeySeparator) as unknown as Repository<T>;
  }

  /**
   * Return the underlying DynamoRepository for each model this store manages
   * @returns the repositories
   */
  getRepositories(): DynamoRepository<any>[] {
    const repos: DynamoRepository<any>[] = [];
    for (const modelId of Object.keys(this._modelsHierarchy ?? {})) {
      let model: ModelClass | undefined;
      try {
        model = useModel(modelId);
      } catch {
        continue;
      }
      if (!model) {
        continue;
      }
      const repo: any = this.getRepository(model);
      repos.push((repo.repository ?? repo) as DynamoRepository<any>);
    }
    return repos;
  }

  /**
   * IAM policy required by the store
   * @param accountId - AWS account id
   * @returns the policy statement
   */
  getARNPolicy(accountId: string) {
    const region = this.parameters.region || "us-east-1";
    const tables = new Set([this.parameters.table, ...Object.values(this.parameters.tables ?? {})]);
    return {
      Sid: this.constructor.name + this.getName(),
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
      Resource: [...tables].map(table => "arn:aws:dynamodb:" + region + ":" + accountId + ":table/" + table)
    };
  }

  /**
   * Delete all items from the managed tables (used in tests)
   */
  async __clean() {
    const done = new Set<string>();
    for (const repo of this.getRepositories()) {
      if (done.has(repo.getTable())) {
        continue;
      }
      done.add(repo.getTable());
      await repo.__clean();
    }
  }

  /**
   * CloudFormation resources for the table
   * @param deployer - the deployer requesting the resources
   * @returns the resources
   */
  getCloudFormation(deployer: CloudFormationDeployerInfo) {
    if (this.parameters.CloudFormationSkip) {
      return {};
    }
    const resources = {};
    this.parameters.CloudFormation = this.parameters.CloudFormation || {};
    this.parameters.CloudFormation.Table = this.parameters.CloudFormation.Table || {};
    const KeySchema = this.parameters.CloudFormation.KeySchema || [{ KeyType: "HASH", AttributeName: KEY_ATTRIBUTE }];
    const AttributeDefinitions = this.parameters.CloudFormation.AttributeDefinitions || [];
    this.parameters.CloudFormation.Table.BillingMode =
      this.parameters.CloudFormation.Table.BillingMode || "PAY_PER_REQUEST";
    AttributeDefinitions.push({ AttributeName: KEY_ATTRIBUTE, AttributeType: "S" });
    resources[this.getName() + "DynamoTable"] = {
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

export default DynamoStore;
