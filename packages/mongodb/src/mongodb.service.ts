import {
  EventRepository,
  InstanceCache,
  MemoryRepository,
  Store,
  StoreNotFoundError,
  StoreParameters,
  UpdateConditionFailError,
  useModelMetadata
} from "@webda/core";
import type { ModelClass, Repository } from "@webda/core";
import * as WebdaQL from "@webda/ql";
import { Collection, Db, DbOptions, Document, MongoClient } from "mongodb";

/**
 * MongoDB store parameters
 */
export class MongoParameters extends StoreParameters {
  /**
   * Contains the URL to Mongo Server
   *
   * Will try to use WEBDA_MONGO_URL environment variable if not defined
   */
  mongoUrl?: string;
  /**
   * Additional options for Mongo connetion
   *
   * Should be typed with MongoClientOptions but not available due to bug in ts-json-schema-generator
   * https://docs.mongodb.com/manual/reference/connection-string
   */
  options?: any;
  /**
   * Which collection to use
   *
   * All the models managed by the store share this collection, the `__type`
   * field is used to differentiate them
   */
  collection: string;
  /**
   * Database to use, default to the one defined in the URL
   */
  database?: string;
  /**
   * Mongo Database Options
   *
   * @see https://www.npmjs.com/package/mongodb
   */
  databaseOptions?: DbOptions;

  /**
   * @override
   * @param params - raw parameters
   * @returns this
   */
  load(params: any = {}): this {
    super.load(params);
    this.mongoUrl ??= process.env["WEBDA_MONGO_URL"];
    if (this.mongoUrl === undefined) {
      throw new Error("An URL is required for MongoDB service");
    }
    this.options ??= {};
    return this;
  }
}

/**
 * Get a mongodb query object from WebdaQL
 * @param expression - the WebdaQL expression
 * @returns the MongoDB filter
 */
export function mapExpression(expression: WebdaQL.Expression): any {
  if (expression instanceof WebdaQL.BooleanExpression) {
    // TRUE matches every document, FALSE none: never let FALSE fail open
    return expression.value ? {} : { $expr: false };
  } else if (expression instanceof WebdaQL.AndExpression) {
    const children = expression.children.map(e => mapExpression(e));
    if (children.some(c => c.$expr === false)) {
      return { $expr: false };
    }
    // Use $and so two conditions on the same attribute do not override each other
    const nonEmpty = children.filter(c => Object.keys(c).length > 0);
    if (nonEmpty.length === 0) {
      return {};
    }
    if (nonEmpty.length === 1) {
      return nonEmpty[0];
    }
    return { $and: nonEmpty };
  } else if (expression instanceof WebdaQL.OrExpression) {
    // An empty OR matches everything (as OrExpression.eval) and $or rejects an empty array
    if (expression.children.length === 0) {
      return {};
    }
    return {
      $or: expression.children.map(e => mapExpression(e))
    };
  } else if (expression instanceof WebdaQL.ComparisonExpression) {
    const attribute = expression.attribute.join(".");
    switch (expression.operator) {
      case "=":
      case "CONTAINS":
        // MongoDB use same syntax for exact match or contains for an array
        return { [attribute]: expression.value };
      case "<":
        return { [attribute]: { $lt: expression.value } };
      case ">":
        return { [attribute]: { $gt: expression.value } };
      case "<=":
        return { [attribute]: { $lte: expression.value } };
      case ">=":
        return { [attribute]: { $gte: expression.value } };
      case "!=":
        return { [attribute]: { $ne: expression.value } };
      case "IN":
        return { [attribute]: { $in: expression.value } };
      case "LIKE":
        return { [attribute]: WebdaQL.ComparisonExpression.likeToRegex(<string>expression.value) };
      case "IS NULL":
        // Matches documents where the field is null or missing
        return { [attribute]: null };
      case "IS NOT NULL":
        // Matches documents where the field exists and is not null
        return { [attribute]: { $ne: null } };
    }
  }
  return {};
}

/**
 * MongoDB-backed repository for a single model class
 *
 * Every object is stored as a plain document with `_id` set to its primary key
 * and `__type` set to its model identifier, so several models can share one
 * collection. The inherited MemoryRepository helpers are only used for primary
 * key and class filter computation.
 */
export class MongoRepository<T extends ModelClass> extends MemoryRepository<T> {
  /**
   * @param model - the model class
   * @param pks - primary key field names
   * @param getCollection - return the collection, connecting if needed
   * @param separator - composite key separator
   */
  constructor(
    model: T,
    pks: string[],
    protected readonly getCollection: () => Promise<Collection<Document>>,
    separator?: string
  ) {
    super(model, pks, separator);
  }

  /**
   * Convert an object to the document stored in MongoDB
   * @param item - the model instance or raw data
   * @param key - the primary key
   * @returns the document
   */
  protected toDocument(item: any, key: string): any {
    const doc = JSON.parse(JSON.stringify(item));
    doc._id = key;
    const type = item?.constructor?.Metadata?.Identifier ?? (this.model as any).Metadata?.Identifier;
    if (type) {
      doc.__type = type;
    }
    return doc;
  }

  /**
   * Convert a stored document into a model instance
   * @param doc - the MongoDB document
   * @returns the model instance
   */
  protected fromDocument(doc: any): InstanceType<T> {
    const { _id, __type, ...data } = doc;
    const instance = new this.model(data) as InstanceType<T>;
    if (typeof (instance as any).load === "function") {
      (instance as any).load(data);
    } else {
      Object.assign(instance as any, data);
    }
    Object.defineProperty(instance, "__type", {
      value: __type ?? (this.model as any).Metadata?.Identifier,
      enumerable: false,
      configurable: true,
      writable: true
    });
    return instance;
  }

  /**
   * Return a filter for Mongo command
   * @param key - the primary key
   * @param conditionField - field to check
   * @param condition - expected value
   * @returns the filter
   */
  protected getFilter(key: string, conditionField?: any, condition?: any): any {
    const filter: any = { _id: key };
    if (conditionField) {
      filter[String(conditionField)] = condition instanceof Date ? condition.toISOString() : condition;
    }
    return filter;
  }

  /** @override */
  async get(primaryKey: any): Promise<any> {
    const key = this.getPrimaryKey(primaryKey).toString();
    const doc = await (await this.getCollection()).findOne({ _id: <any>key });
    if (doc === null) {
      throw new Error(`Not found: ${key}`);
    }
    return this.fromDocument(doc);
  }

  /** @override */
  async create(data: any, save: boolean = true): Promise<any> {
    // Build the item once so a primary key generated by the model (e.g. UuidModel)
    // is the one stored, even when the input carries an undefined key
    const item = this.buildItem(data);
    const key = this.getPrimaryKey(item).toString();
    if (save !== false) {
      try {
        await (await this.getCollection()).insertOne(this.toDocument(item, key));
      } catch (err) {
        if (err?.code === 11000) {
          throw new Error(`Already exists: ${key}`);
        }
        throw err;
      }
    }
    return item;
  }

  /** @override */
  async update(data: any, conditionField?: any, condition?: any): Promise<void> {
    const key = this.getPrimaryKey(data).toString();
    const res = await (
      await this.getCollection()
    ).replaceOne(this.getFilter(key, conditionField, condition), this.toDocument(data, key));
    if (res.matchedCount === 0) {
      throw new UpdateConditionFailError(key as any, conditionField as string, condition);
    }
  }

  /** @override */
  async patch(primaryKey: any, data: any, conditionField?: any, condition?: any): Promise<void> {
    const key = this.getPrimaryKey(primaryKey).toString();
    const $set = JSON.parse(JSON.stringify(data));
    delete $set._id;
    delete $set.__type;
    const res = await (await this.getCollection()).updateOne(this.getFilter(key, conditionField, condition), { $set });
    if (res.matchedCount === 0) {
      throw new UpdateConditionFailError(key as any, conditionField as string, condition);
    }
  }

  /** @override */
  async delete(primaryKey: any, conditionField?: any, condition?: any): Promise<void> {
    const key = this.getPrimaryKey(primaryKey).toString();
    const res = await (await this.getCollection()).deleteOne(this.getFilter(key, conditionField, condition));
    if (conditionField && res.deletedCount === 0) {
      throw new UpdateConditionFailError(key as any, conditionField as string, condition);
    }
  }

  /** @override */
  async exists(primaryKey: any): Promise<boolean> {
    const key = this.getPrimaryKey(primaryKey).toString();
    return (await (await this.getCollection()).countDocuments({ _id: <any>key }, { limit: 1 })) === 1;
  }

  /** @override */
  async removeAttribute(primaryKey: any, attribute: any, conditionField?: any, condition?: any): Promise<void> {
    const key = this.getPrimaryKey(primaryKey).toString();
    const res = await (
      await this.getCollection()
    ).updateOne(this.getFilter(key, conditionField, condition), {
      $unset: { [String(attribute)]: 1 },
      $set: { _lastUpdate: new Date().toISOString() }
    });
    if (res.matchedCount === 0) {
      if (conditionField) {
        throw new UpdateConditionFailError(key as any, conditionField as string, condition);
      }
      throw new StoreNotFoundError(key as any, this.getCollectionName());
    }
  }

  /** @override */
  async incrementAttributes(primaryKey: any, info: any, conditionField?: any, condition?: any): Promise<void> {
    const key = this.getPrimaryKey(primaryKey).toString();
    const $inc: Record<string, number> = {};
    if (Array.isArray(info)) {
      for (const e of info) {
        if (typeof e === "string") {
          $inc[e] = 1;
        } else {
          $inc[e.property] = e.value ?? 1;
        }
      }
    } else {
      for (const [property, value] of Object.entries(info)) {
        $inc[property] = value as number;
      }
    }
    const res = await (
      await this.getCollection()
    ).updateOne(this.getFilter(key, conditionField, condition), {
      $inc,
      $set: { _lastUpdate: new Date().toISOString() }
    });
    if (res.matchedCount === 0) {
      if (conditionField) {
        throw new UpdateConditionFailError(key as any, conditionField as string, condition);
      }
      throw new StoreNotFoundError(key as any, this.getCollectionName());
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
    const key = this.getPrimaryKey(primaryKey).toString();
    const prop = String(collection);
    const filter: any = { _id: key };
    const value = JSON.parse(JSON.stringify(item));
    let params: any;
    if (index === undefined) {
      params = { $push: { [prop]: value }, $set: { _lastUpdate: new Date().toISOString() } };
    } else {
      params = { $set: { [`${prop}.${index}`]: value, _lastUpdate: new Date().toISOString() } };
      if (itemWriteCondition !== undefined) {
        filter[`${prop}.${index}.${String(itemWriteConditionField)}`] = itemWriteCondition;
      }
    }
    const res = await (await this.getCollection()).updateOne(filter, params);
    if (res.matchedCount === 0) {
      if (itemWriteCondition !== undefined) {
        throw new UpdateConditionFailError(key as any, String(itemWriteConditionField), itemWriteCondition);
      }
      throw new StoreNotFoundError(key as any, this.getCollectionName());
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
    const key = this.getPrimaryKey(primaryKey).toString();
    const prop = String(collection);
    const filter: any = { _id: key };
    if (itemWriteCondition !== undefined) {
      filter[`${prop}.${index}.${String(itemWriteConditionField)}`] = itemWriteCondition;
    }
    const col = await this.getCollection();
    // MongoDB cannot remove an array element by index: unset it then pull the null
    const res = await col.updateOne(filter, {
      $unset: { [`${prop}.${index}`]: 1 },
      $set: { _lastUpdate: new Date().toISOString() }
    });
    if (res.matchedCount === 0) {
      if (itemWriteCondition !== undefined) {
        throw new UpdateConditionFailError(key as any, String(itemWriteConditionField), itemWriteCondition);
      }
      throw new StoreNotFoundError(key as any, this.getCollectionName());
    }
    await col.updateOne({ _id: <any>key }, { $pull: <any>{ [prop]: null } });
  }

  /**
   * Build the MongoDB filter restricting results to this model and its subclasses
   *
   * Documents without `__type` are considered as instance of the repository model
   * @returns the class filter or undefined if the model has no metadata
   */
  protected getClassFilter(): any {
    const ids = this.buildClassFilterIdentifiers();
    if (!ids) {
      return undefined;
    }
    return { $or: [{ __type: { $in: ids } }, { __type: { $exists: false } }] };
  }

  /** @override — translate the WebdaQL query to a MongoDB find */
  async query(query: string | any): Promise<{ results: InstanceType<T>[]; continuationToken?: string }> {
    const parsed: any = typeof query === "string" ? WebdaQL.parse(query) : query;
    let offset = parseInt(parsed.continuationToken);
    if (isNaN(offset)) {
      offset = 0;
    }
    const sort: Record<string, 1 | -1> = {};
    for (const order of parsed.orderBy ?? []) {
      sort[order.field] = order.direction === "ASC" ? 1 : -1;
    }
    const limit = parsed.limit || 1000;
    let filter = mapExpression(parsed.filter);
    const classFilter = this.getClassFilter();
    if (classFilter) {
      filter = Object.keys(filter).length ? { $and: [classFilter, filter] } : classFilter;
    }
    const docs = await (await this.getCollection()).find(filter).sort(sort).skip(offset).limit(limit).toArray();
    const results = docs.map(doc => this.fromDocument(doc));
    return {
      results,
      continuationToken: results.length >= limit ? (offset + limit).toString() : undefined
    };
  }

  /**
   * Name of the underlying collection, used in errors
   * @returns the collection name
   */
  protected getCollectionName(): string {
    return (this.model as any).Metadata?.Identifier ?? "MongoDB";
  }
}

/**
 * Store Objects in MongoDB
 *
 * Parameters:
 *   mongoUrl: 'mongodb://127.0.0.1:27017' // If not found try to read WEBDA_MONGO_URL env variable
 *
 * @WebdaModda
 */
export class MongoStore<K extends MongoParameters = MongoParameters> extends Store<K> {
  /**
   * Connect promise
   */
  protected _connectPromise: Promise<Collection<Document>> = undefined;
  /**
   * Client
   */
  _client: MongoClient;
  _db: Db;
  _collection: Collection<Document>;

  /**
   * Connect to MongoDB if not already connected
   * @returns the collection
   */
  async _connect(): Promise<Collection<Document>> {
    this._connectPromise ??= (async () => {
      this._client = await new MongoClient(this.parameters.mongoUrl, this.parameters.options).connect();
      this._db = this._client.db(this.parameters.database, this.parameters.databaseOptions);
      this._collection = this._db.collection(this.parameters.collection);
      return this._collection;
    })();
    return this._connectPromise;
  }

  /**
   * @override
   */
  async init(): Promise<this> {
    await this._connect();
    return super.init();
  }

  /**
   * @override
   */
  async stop(): Promise<void> {
    if (this._connectPromise) {
      this._connectPromise = undefined;
      await this._client?.close();
      this._client = undefined;
      this._db = undefined;
      this._collection = undefined;
    }
    await super.stop();
  }

  /**
   * Build and return a MongoRepository for the given model
   *
   * The collection is resolved lazily so the repository can be registered
   * before the store is connected.
   * @param model - the model class
   * @returns a repository backed by the store collection
   */
  @InstanceCache()
  getRepository<T extends ModelClass>(model: T): Repository<T> {
    const pks = useModelMetadata(model).PrimaryKey;
    const inner = new MongoRepository<T>(model, pks, () => this._connect());
    // Wrap in EventRepository so typed CRUD events fire; consumers reach them
    // via useRepository(model).on(...).
    return new EventRepository<T>(model, pks, inner) as unknown as Repository<T>;
  }

  /**
   * Remove every document from the collection (used in tests)
   */
  async __clean(): Promise<void> {
    await (await this._connect()).deleteMany({});
  }
}

export default MongoStore;
