import {
  Command,
  EventRepository,
  InstanceCache,
  MemoryRepository,
  SecretString,
  Store,
  StoreNotFoundError,
  StoreParameters,
  UNTYPED,
  UpdateConditionFailError,
  useModelMetadata
} from "@webda/core";
import type {
  MigratableStore,
  ModelClass,
  RawPage,
  RawPatch,
  RawTable,
  Repository,
  StoredTypeCounts
} from "@webda/core";
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
   *
   * Can be encrypted with `webda config encrypt`
   */
  mongoUrl?: string | SecretString;
  /**
   * Additional options for Mongo connetion
   *
   * Should be typed with MongoClientOptions but not available due to bug in ts-json-schema-generator
   * https://docs.mongodb.com/manual/reference/connection-string
   *
   * Can be encrypted with `webda config encrypt`
   * @secret auth.password,tlsCertificateKeyFilePassword
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
        return { [attribute]: expression.value };
      case "CONTAINS":
        // Only an array holding the value (a plain `{a: v}` would also match a scalar equal to v)
        return { [attribute]: { $elemMatch: { $eq: expression.value } } };
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
 * Anchored, case-insensitive regular expressions matching exactly the given strings: stored types resolve
 * case-insensitively (`WEBDA/USER` is `Webda/User`)
 * @param names - the strings
 * @returns one expression per distinct lower-cased string
 */
export function matchIgnoreCase(names: string[]): RegExp[] {
  return [...new Set(names.map(name => name.toLowerCase()))].map(
    name => new RegExp(`^${name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`, "i")
  );
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
   * @param fallbackType - the type to stamp when the object declares none (null: none)
   * @returns the document
   */
  protected toDocument(
    item: any,
    key: string,
    fallbackType: string | null | undefined = (this.model as any).Metadata?.Identifier
  ): any {
    const doc = JSON.parse(JSON.stringify(item));
    doc._id = key;
    // An enumerable `__type` key of plain data is never trusted
    delete doc.__type;
    const type = this.declaredType(item) ?? fallbackType;
    if (type) {
      doc.__type = type;
    }
    return doc;
  }

  /**
   * The type an object written by the application declares: the `__type` its document was read with
   * (non-enumerable, set by {@link fromDocument}), else the identifier of its class. Plain data declares none.
   * @param item - the object
   * @returns the model identifier, undefined for plain data
   */
  protected declaredType(item: any): string | undefined {
    if (!item || typeof item !== "object") {
      return undefined;
    }
    const own = Object.getOwnPropertyDescriptor(item, "__type");
    if (own && !own.enumerable && typeof own.value === "string") {
      return own.value;
    }
    const clazz = Object.getPrototypeOf(item)?.constructor;
    return clazz && clazz !== Object ? clazz.Metadata?.Identifier : undefined;
  }

  /**
   * Convert a stored document into a model instance
   * @param doc - the MongoDB document
   * @returns the model instance
   */
  protected fromDocument(doc: any): InstanceType<T> {
    const { _id, __type, ...data } = doc;
    const typed = typeof __type === "string" && __type !== "";
    // A document loads as the class its type resolves to (a Webda 3 form included): a subclass row as the subclass
    const clazz: any = (typed && this.findModelClass(__type)) || this.model;
    const instance = new clazz(data) as InstanceType<T>;
    if (typeof (instance as any).load === "function") {
      (instance as any).load(data);
    } else {
      Object.assign(instance as any, data);
    }
    Object.defineProperty(instance, "__type", {
      // The current identifier of a legacy type, the stored value when it is unknown or ambiguous
      value: typed ? this.currentTypeOf(instance, __type) : (this.model as any).Metadata?.Identifier,
      enumerable: false,
      configurable: true,
      writable: true
    });
    return instance;
  }

  /**
   * Aggregation expression of the `__type` a written document keeps: its stored type, rewritten to the current
   * identifier when it is a legacy form of this model family (see `legacyTypeRewrites`)
   * @returns the expression, `"$__type"` when nothing is rewritten
   */
  protected keptTypeExpression(): any {
    const rewrites = Object.entries(this.legacyTypeRewrites());
    if (!rewrites.length) {
      return "$__type";
    }
    return {
      $switch: {
        branches: rewrites.map(([stored, current]) => ({
          case: { $eq: [{ $toLower: { $ifNull: ["$__type", ""] } }, stored] },
          then: current
        })),
        default: "$__type"
      }
    };
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
        if (typeof err === "object" && err !== null && "code" in err && err.code === 11000) {
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
    const collection = await this.getCollection();
    const filter = this.getFilter(key, conditionField, condition);
    let res;
    if (this.declaredType(data)) {
      res = await collection.replaceOne(filter, this.toDocument(data, key));
    } else {
      // Plain data (ModelRef.update) keeps the stored type, in one atomic write: a write through a parent
      // repository never re-types a subclass document, a legacy type is rewritten to its current identifier.
      // `$literal` keeps `$`-prefixed values as data.
      res = await collection.updateOne(filter, [
        {
          $replaceWith: {
            $mergeObjects: [{ $literal: this.toDocument(data, key, null) }, { __type: this.keptTypeExpression() }]
          }
        }
      ]);
    }
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
    // One atomic pipeline: the fields are merged at the top level and a legacy type gets its current identifier.
    // `$literal` keeps `$`-prefixed values as data.
    const res = await (
      await this.getCollection()
    ).updateOne(this.getFilter(key, conditionField, condition), [
      { $replaceWith: { $mergeObjects: ["$$ROOT", { $literal: $set }] } },
      { $set: { __type: this.keptTypeExpression() } }
    ]);
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
   * Build the MongoDB filter restricting results to this model and its subclasses, whatever form their `__type` has
   * (Webda 3 short, lower-case and aliased types included, matched case-insensitively)
   *
   * Documents without `__type` (written before stamping) and documents typed as a strict ancestor of the table root
   * belong to the table root and its ancestors; to every model when the table root is not known
   * @returns the class filter or undefined if the model has no metadata
   */
  protected getClassFilter(): any {
    const ids = this.buildClassFilterIdentifiers();
    if (!ids) {
      return undefined;
    }
    // A model unknown to the application keeps the exact matching of its own hierarchy
    const typed = (names: string[]) => ({
      __type: { $in: this.typeResolver().exactOnly ? names : matchIgnoreCase(names) }
    });
    const conditions: any[] = [typed([...new Set([...ids, ...this.acceptedTypes()])])];
    if (this.belongsToModel(undefined)) {
      conditions.push({ __type: null }, { __type: "" });
      const ancestors = this.tableRootAncestorTypes();
      if (ancestors.length) {
        conditions.push(typed(ancestors));
      }
    }
    return { $or: conditions };
  }

  /**
   * Translate a WebdaQL filter to a MongoDB filter restricted to this model
   * @param expression - the WebdaQL expression
   * @returns the MongoDB filter
   */
  protected buildFilter(expression: WebdaQL.Expression): any {
    const filter = mapExpression(expression);
    const classFilter = this.getClassFilter();
    if (classFilter) {
      return Object.keys(filter).length ? { $and: [classFilter, filter] } : classFilter;
    }
    return filter;
  }

  /**
   * Translate an aggregation to a MongoDB pipeline
   *
   * Group keys live in `_id.gN` and are flattened by executeAggregation, since MongoDB
   * cannot project dotted output names. The query is validated again first: paths and aliases become
   * field references and output names.
   * @param query - the aggregation
   * @returns the pipeline
   */
  buildAggregationPipeline(query: WebdaQL.AggregationQuery): any[] {
    WebdaQL.validateAggregation(query);
    const id: Record<string, any> = {};
    const sortKeys: Record<string, string> = {};
    query.groupBy.forEach((path, i) => {
      // $ifNull: a missing field and an explicit null always share one group
      id[`g${i}`] = { $ifNull: [`$${path}`, null] };
      sortKeys[path] = `_id.g${i}`;
    });
    const group: Record<string, any> = { _id: query.groupBy.length ? id : null };
    const sizes: Record<string, any> = {};
    for (const [alias, metric] of Object.entries(query.metrics)) {
      const field = `$${metric.field}`;
      sortKeys[alias] = alias;
      switch (metric.fn) {
        case "COUNT":
          group[alias] = metric.field
            ? { $sum: { $cond: [{ $ne: [{ $ifNull: [field, null] }, null] }, 1, 0] } }
            : { $sum: 1 };
          break;
        case "COUNT_DISTINCT":
          group[alias] = { $addToSet: field };
          sizes[alias] = { $size: { $filter: { input: `$${alias}`, cond: { $ne: ["$$this", null] } } } };
          break;
        case "SUM":
          group[alias] = { $sum: field };
          break;
        case "AVG":
          group[alias] = { $avg: field };
          break;
        case "MIN":
          group[alias] = { $min: field };
          break;
        case "MAX":
          group[alias] = { $max: field };
          break;
      }
    }
    const pipeline: any[] = [{ $match: this.buildFilter(query.filter) }, { $group: group }];
    if (Object.keys(sizes).length) {
      pipeline.push({ $addFields: sizes });
    }
    const sort: Record<string, 1 | -1> = {};
    for (const order of query.orderBy ?? []) {
      sort[sortKeys[order.key]] = order.direction === "ASC" ? 1 : -1;
    }
    if (!Object.keys(sort).length && query.groupBy.length) {
      query.groupBy.forEach((_, i) => (sort[`_id.g${i}`] = 1));
    }
    if (Object.keys(sort).length) {
      pipeline.push({ $sort: sort });
    }
    const limit = query.limit ?? (query.groupBy.length ? this.aggregationOptions.maxGroups + 1 : undefined);
    if (limit) {
      pipeline.push({ $limit: limit });
    }
    return pipeline;
  }

  /** @override — MongoDB aggregation pipeline */
  protected async executeAggregation(query: WebdaQL.AggregationQuery): Promise<WebdaQL.AggregationResult<any>> {
    const docs = await (
      await this.getCollection()
    )
      .aggregate(this.buildAggregationPipeline(query), { allowDiskUse: true })
      .toArray();
    if (query.limit === undefined && docs.length > this.aggregationOptions.maxGroups) {
      throw new WebdaQL.AggregationError(
        "AGGREGATION_TOO_MANY_GROUPS",
        `Aggregation exceeds ${this.aggregationOptions.maxGroups} groups`
      );
    }
    const rows = docs.map(doc => {
      const row: Record<string, unknown> = {};
      query.groupBy.forEach((path, i) => (row[path] = doc._id?.[`g${i}`] ?? null));
      for (const [alias, metric] of Object.entries(query.metrics)) {
        row[alias] = doc[alias] ?? (metric.fn === "SUM" || metric.fn.startsWith("COUNT") ? 0 : null);
      }
      return row;
    });
    if (!rows.length && !query.groupBy.length) {
      // MongoDB returns no document for an empty global aggregation, SQL and the spec return one row
      return { rows: new WebdaQL.Aggregator(query).rows(), native: true };
    }
    return { rows, native: true };
  }

  /** @override — translate the WebdaQL query to a MongoDB find */
  async query(query: string | any): Promise<{ results: InstanceType<T>[]; continuationToken?: string }> {
    // A query object built or changed by code goes back through the grammar: no forged operator reaches MongoDB
    const parsed: any = typeof query === "string" ? WebdaQL.parse(query) : WebdaQL.normalizeQuery(query);
    // DELETE / UPDATE go to deleteMany / updateMany; a field list is not a projection here
    WebdaQL.assertFilterQuery(parsed);
    let offset = parseInt(parsed.continuationToken);
    if (isNaN(offset)) {
      offset = 0;
    }
    const sort: Record<string, 1 | -1> = {};
    for (const order of parsed.orderBy ?? []) {
      sort[order.field] = order.direction === "ASC" ? 1 : -1;
    }
    const limit = parsed.limit || 1000;
    const filter = this.buildFilter(parsed.filter);
    const docs = await (await this.getCollection()).find(filter).sort(sort).skip(offset).limit(limit).toArray();
    const results = docs.map(doc => this.fromDocument(doc));
    return {
      results,
      continuationToken: results.length >= limit ? (offset + limit).toString() : undefined
    };
  }

  /**
   * MongoDB filter of the objects a statement targets: its WHERE and the class filter, restricted to the first
   * LIMIT documents when the statement has a LIMIT (MongoDB bulk writes have none)
   * @param statement - the parsed statement
   * @returns the filter, undefined when LIMIT is 0
   */
  protected async getStatementFilter(statement: WebdaQL.Query): Promise<any | undefined> {
    const filter = this.buildFilter(statement.filter);
    if (statement.limit === undefined) {
      return filter;
    }
    if (statement.limit <= 0) {
      return undefined;
    }
    // Collect the keys first: the update cannot meet an object twice, and LIMIT is honoured
    const ids = (
      await (
        await this.getCollection()
      )
        .find(filter, { projection: { _id: 1 } })
        .limit(statement.limit)
        .toArray()
    ).map(doc => doc._id);
    // The WHERE is kept: a document that stopped matching since the find is left alone
    return { $and: [filter, { _id: { $in: ids } }] };
  }

  /**
   * Delete in bulk with one `deleteMany`: no per-object event (see `Repository.deleteMany`)
   * @override
   */
  async deleteMany(statement: string | WebdaQL.Query, params?: WebdaQL.QueryParameters): Promise<number> {
    const parsed = await this.parseStatement("DELETE", statement, params);
    const filter = await this.getStatementFilter(parsed);
    if (!filter) return 0;
    return (await (await this.getCollection()).deleteMany(filter)).deletedCount;
  }

  /**
   * Update in bulk with one `updateMany` and `$set` (dotted targets create their parents): no per-object event
   * (see `Repository.updateMany`)
   * @override
   */
  async updateMany(statement: string | WebdaQL.Query, params?: WebdaQL.QueryParameters): Promise<number> {
    const parsed = await this.parseStatement("UPDATE", statement, params);
    const filter = await this.getStatementFilter(parsed);
    if (!filter) return 0;
    const $set: Record<string, any> = {};
    for (const { field, value } of parsed.assignments!) {
      $set[field] = value;
    }
    return (await (await this.getCollection()).updateMany(filter, { $set })).matchedCount;
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
export class MongoStore<K extends MongoParameters = MongoParameters> extends Store<K> implements MigratableStore {
  /**
   * Connect promise
   */
  protected _connectPromise?: Promise<Collection<Document>>;
  /**
   * Client
   */
  _client?: MongoClient;
  _db?: Db;
  _collection?: Collection<Document>;

  /**
   * Connect to MongoDB if not already connected
   * @returns the collection
   */
  async _connect(): Promise<Collection<Document>> {
    this._connectPromise ??= (async () => {
      this._client = await new MongoClient(
        SecretString.unwrap(this.parameters.mongoUrl) as string,
        SecretString.unwrap(this.parameters.options)
      ).connect();
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
    const meta = useModelMetadata(model);
    const pks = meta.PrimaryKey;
    const inner = new MongoRepository<T>(model, pks, () => this._connect(), meta.PrimaryKeySeparator);
    // Wrap in EventRepository so typed CRUD events fire; consumers reach them
    // via useRepository(model).on(...).
    // Untyped documents of the shared collection belong to the first model of the store
    return new EventRepository<T>(model, pks, inner, meta.PrimaryKeySeparator).setTableRoot(
      this.getTableRoot()
    ) as unknown as Repository<T>;
  }

  /**
   * One table: the collection of the store
   * @override
   */
  getRawTables(): RawTable[] {
    return [{ name: this.parameters.collection, root: this.getTableRoot() }];
  }

  /**
   * Refuse a table that is not the collection of this store
   * @param table - the requested table
   */
  protected checkCollection(table: string): void {
    if (table !== this.parameters.collection) {
      throw new Error(`Unknown table ${table} in store ${this.getName()}`);
    }
  }

  /**
   * Documents ordered by `_id`, the token is the last `_id` of the page
   * @override
   */
  async rawPages(table: string, batchSize: number, token?: string): Promise<RawPage> {
    this.checkCollection(table);
    const docs = await (
      await this._connect()
    )
      .find(token === undefined ? {} : { _id: { $gt: <any>token } })
      .sort({ _id: 1 })
      .limit(batchSize + 1)
      .toArray();
    const rows = docs.slice(0, batchSize).map(({ _id, ...data }) => ({ table, key: String(_id), data }));
    return {
      rows,
      continuationToken: docs.length > batchSize ? rows[rows.length - 1].key : undefined
    };
  }

  /**
   * Set top-level fields of the document in one update, no read: `$literal` keeps `$`-prefixed values as data
   * @override
   */
  async rawPatch(table: string, key: string, patch: RawPatch): Promise<void> {
    this.checkCollection(table);
    const res = await (
      await this._connect()
    ).updateOne({ _id: <any>key }, [{ $replaceWith: { $mergeObjects: ["$$ROOT", { $literal: patch }] } }]);
    if (res.matchedCount === 0) {
      throw new Error(`Raw row not found: ${key}`);
    }
  }

  /**
   * Exact counts with one `$group` on the collection: never truncated
   * @override
   */
  async countStoredTypes(_maxRows: number): Promise<StoredTypeCounts> {
    const counts: Record<string, number> = {};
    const groups = await (
      await this._connect()
    )
      .aggregate([
        {
          $group: {
            // A missing, empty or non-string type is untyped, as for the other stores
            _id: {
              $cond: [
                { $and: [{ $eq: [{ $type: "$__type" }, "string"] }, { $ne: ["$__type", ""] }] },
                "$__type",
                UNTYPED
              ]
            },
            n: { $sum: 1 }
          }
        }
      ])
      .toArray();
    for (const group of groups) {
      counts[group._id] = (counts[group._id] ?? 0) + group.n;
    }
    return { tables: { [this.parameters.collection]: counts }, truncated: false };
  }

  /**
   * Rewrite the Webda 3 types of the store to their Webda 4 identifiers
   * @param dryRun - only count the rows to migrate, write nothing
   * @param batch - rows per page
   * @param allowUnknown - exit with 0 even when rows keep an unknown or ambiguous type
   * @returns the exit code
   */
  @Command("migrate", {
    description: "Rewrite the Webda 3 types of the stores to their Webda 4 identifiers",
    phase: "initialized"
  })
  async migrate(
    /** @description Only count the rows to migrate, write nothing */
    dryRun: boolean = false,
    /** @description Rows per page */
    batch: number = 500,
    /** @description Exit with 0 even when rows keep an unknown or ambiguous type */
    allowUnknown: boolean = false
  ): Promise<number> {
    return this.migrateCommand(dryRun, batch, allowUnknown);
  }

  /**
   * Remove every document from the collection (used in tests)
   */
  async __clean(): Promise<void> {
    await (await this._connect()).deleteMany({});
  }
}

export default MongoStore;
